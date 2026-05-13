import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FixtureProvider,
  OpenAIProvider,
  parseOpenAIChunk,
  parseOpenAIStream,
  ProviderError,
  serializeMessages,
  type ProviderEvent,
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("providers", () => {
  it("parses OpenAI-compatible streaming text and usage events", async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      expect(String(input)).toBe("https://api.example.test/v1/chat/completions");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        authorization: "Bearer sk-test",
      });
      return new Response(
        streamFromString(
          [
            'data: {"choices":[{"delta":{"content":"Hel"}}]}',
            "",
            'data: {"choices":[{"delta":{"content":"lo"}}],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
        ),
      );
    };
    const provider = new OpenAIProvider({
      baseURL: "https://api.example.test/v1/",
      apiKey: "sk-test",
      fetch: fetchMock,
    });

    const events = await collectEvents(provider.stream(input(), new AbortController().signal));

    expect(events).toEqual([
      { type: "text_delta", text: "Hel" },
      { type: "usage", inputTokens: 3, outputTokens: 2 },
      { type: "text_delta", text: "lo" },
      { type: "done" },
    ]);
  });

  it("serializes tool schemas and tool result messages", async () => {
    let requestBody: unknown;
    const fetchMock: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(streamFromString("data: [DONE]\n\n"));
    };
    const provider = new OpenAIProvider({
      baseURL: "https://api.example.test/v1",
      apiKey: "sk-test",
      fetch: fetchMock,
    });

    await collectEvents(provider.stream({
      model: "test-model",
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "read_file", input: { path: "package.json" } }],
        },
        {
          role: "tool",
          content: "{\"ok\":true}",
          toolCallId: "call_1",
          name: "read_file",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "read",
            parameters: { type: "object", properties: {}, required: [] },
          },
        },
      ],
    }, new AbortController().signal));

    expect(requestBody).toMatchObject({
      tools: [{ type: "function", function: { name: "read_file" } }],
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", tool_calls: [{ id: "call_1", function: { name: "read_file" } }] },
        { role: "tool", tool_call_id: "call_1", content: "{\"ok\":true}" },
      ],
    });
  });

  it("parses complete tool calls and emits partial argument fragments", () => {
    expect(parseOpenAIChunk(JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "read_file", arguments: "{\"path\":\"package.json\"}" },
              },
            ],
          },
        },
      ],
    }))).toEqual([
      {
        type: "tool_call",
        toolCall: {
          id: "call_1",
          name: "read_file",
          input: { path: "package.json" },
        },
      },
    ]);

    expect(parseOpenAIChunk(JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "read_file", arguments: "{\"path\":" },
              },
            ],
          },
        },
      ],
    }))).toEqual([
      {
        type: "tool_call_delta",
        id: "call_1",
        name: "read_file",
        argumentsDelta: "{\"path\":",
      },
    ]);
  });

  it("tracks OpenAI tool call ids across streaming fragments", async () => {
    const events = await collectEvents(parseOpenAIStream(streamFromString([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":"}}]}}]}',
      "",
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"package.json\\"}"}}]}}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n"))));

    expect(events).toEqual([
      {
        type: "tool_call_delta",
        id: "call_1",
        name: "read_file",
        argumentsDelta: "{\"path\":",
      },
      {
        type: "tool_call_delta",
        id: "call_1",
        argumentsDelta: "\"package.json\"}",
      },
      { type: "done" },
    ]);
  });

  it("hides think blocks split across streaming content chunks", async () => {
    const events = await collectEvents(parseOpenAIStream(sseStream([
      { choices: [{ delta: { content: "<thi" } }] },
      { choices: [{ delta: { content: "nk>secret" } }] },
      { choices: [{ delta: { content: "</thi" } }] },
      { choices: [{ delta: { content: "nk>visible" } }] },
    ])));

    expect(events).toEqual([
      { type: "thinking_delta", text: "secret", hidden: true },
      { type: "text_delta", text: "visible" },
      { type: "done" },
    ]);
  });

  it("hides complete think blocks in one streaming chunk", async () => {
    const events = await collectEvents(parseOpenAIStream(sseStream([
      { choices: [{ delta: { content: "<think>secret</think>visible" } }] },
    ])));

    expect(events).toEqual([
      { type: "thinking_delta", text: "secret", hidden: true },
      { type: "text_delta", text: "visible" },
      { type: "done" },
    ]);
  });

  it("hides native provider reasoning fields", async () => {
    const events = await collectEvents(parseOpenAIStream(sseStream([
      {
        choices: [
          {
            delta: {
              content: "visible",
              reasoning_content: "native",
              reasoning: "compat",
              thinking: "thought",
            },
          },
        ],
      },
    ])));

    expect(events).toEqual([
      { type: "text_delta", text: "visible" },
      { type: "thinking_delta", text: "native", hidden: true },
      { type: "thinking_delta", text: "compat", hidden: true },
      { type: "thinking_delta", text: "thought", hidden: true },
      { type: "done" },
    ]);
  });

  it("flushes unclosed think blocks as hidden reasoning", async () => {
    const events = await collectEvents(parseOpenAIStream(sseStream([
      { choices: [{ delta: { content: "visible<think>secret" } }] },
    ])));

    expect(events).toEqual([
      { type: "text_delta", text: "visible" },
      { type: "thinking_delta", text: "secret", hidden: true },
      { type: "done" },
    ]);
  });

  it("raises provider errors for malformed complete tool arguments", () => {
    expect(() => parseOpenAIChunk(JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "read_file", arguments: "not-json" },
              },
            ],
          },
        },
      ],
    }))).toThrow(ProviderError);
  });

  it("raises provider errors for failed responses", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response("bad credentials", { status: 401 });
    const provider = new OpenAIProvider({
      baseURL: "https://api.example.test/v1",
      apiKey: "sk-test",
      fetch: fetchMock,
    });

    await expect(collectEvents(provider.stream(input(), new AbortController().signal))).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  it("replays fixture events without network access", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-fixture-test-"));
    tempDirs.push(dir);
    const fixturePath = path.join(dir, "basic-text.json");
    await writeFile(
      fixturePath,
      JSON.stringify({
        events: [
          { type: "text_delta", text: "fixture" },
          { type: "done" },
        ],
      }),
    );

    const provider = await FixtureProvider.fromFile(fixturePath);
    const events = await collectEvents(provider.stream(input(), new AbortController().signal));

    expect(events).toEqual([
      { type: "text_delta", text: "fixture" },
      { type: "done" },
    ]);
  });

  it("replays staged fixture responses", async () => {
    const provider = new FixtureProvider([
      [
        {
          type: "tool_call",
          toolCall: {
            id: "call_1",
            name: "read_file",
            input: { path: "package.json" },
          },
        },
        { type: "done" },
      ],
      [
        { type: "text_delta", text: "final" },
        { type: "done" },
      ],
    ]);

    expect(await collectEvents(provider.stream(input(), new AbortController().signal))).toEqual([
      {
        type: "tool_call",
        toolCall: {
          id: "call_1",
          name: "read_file",
          input: { path: "package.json" },
        },
      },
      { type: "done" },
    ]);
    expect(await collectEvents(provider.stream(input(), new AbortController().signal))).toEqual([
      { type: "text_delta", text: "final" },
      { type: "done" },
    ]);
  });
});

describe("message serialization", () => {
  it("serializes assistant tool calls and tool messages", () => {
    expect(serializeMessages([
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "bash", input: { command: "pwd" } }],
      },
      {
        role: "tool",
        content: "ok",
        toolCallId: "call_1",
        name: "bash",
      },
    ])).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "bash", arguments: "{\"command\":\"pwd\"}" },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        name: "bash",
        content: "ok",
      },
    ]);
  });
});

function input() {
  return {
    model: "test-model",
    messages: [{ role: "user" as const, content: "hello" }],
  };
}

async function collectEvents(stream: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function streamFromString(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function sseStream(payloads: unknown[]): ReadableStream<Uint8Array> {
  return streamFromString([
    ...payloads.flatMap((payload) => [`data: ${JSON.stringify(payload)}`, ""]),
    "data: [DONE]",
    "",
  ].join("\n"));
}
