import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FixtureProvider,
  OpenAIProvider,
  ProviderError,
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
