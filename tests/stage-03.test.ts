import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  HumanInteractionManager,
  RenderBatcher,
  StreamingReasoningSplitter,
  ToolAccumulator,
  ToolState,
  applyTurnEvent,
  createApprovalMiddleware,
  createTurnRendererState,
  createDefaultToolRegistry,
  main,
  renderPlainUiEvent,
  runReactLoop,
  splitReasoningParts,
  summarizeToolUse,
  type AgentMiddleware,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderInput,
  type ToolResult,
  type UiEvent,
} from "../src/index.js";

describe("stage-03", () => {
  it("runs middleware around model and tool use while emitting UI events", async () => {
    const provider = new StagedProvider([
      [
        { type: "text_delta", text: "checking " },
        { type: "thinking_delta", text: "hidden", hidden: true },
        { type: "tool_call_delta", id: "call_read", name: "read_file", argumentsDelta: "{\"path\":\"package" },
        { type: "tool_call_delta", id: "call_read", argumentsDelta: ".json\",\"limit\":20}" },
        { type: "done" },
      ],
      [
        { type: "text_delta", text: "done" },
        { type: "done" },
      ],
    ]);
    const calls: string[] = [];
    const uiEvents: UiEvent[] = [];
    const middleware: AgentMiddleware = {
      beforeAgentRun() {
        calls.push("beforeAgentRun");
      },
      beforeModel(context) {
        calls.push(`beforeModel:${context.input.messages.length}`);
        expect(context.contextBuild?.providerInput).toBe(context.input);
      },
      afterModel() {
        calls.push("afterModel");
      },
      beforeToolUse(context) {
        calls.push(`beforeToolUse:${context.toolUse.name}`);
        return {
          ok: true,
          output: "middleware supplied tool result",
          metadata: { source: "middleware" },
        };
      },
      afterToolUse(context) {
        calls.push(`afterToolUse:${context.result.ok}`);
      },
      afterAgentRun(context) {
        calls.push(`afterAgentRun:${context.status}`);
      },
    };

    const result = await runReactLoop({
      task: "read package",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      middleware: [middleware],
      onUiEvent(event) {
        uiEvents.push(event);
      },
    });

    expect(result.assistantMessage.content).toBe("done");
    expect(calls).toEqual([
      "beforeAgentRun",
      "beforeModel:5",
      "afterModel",
      "beforeToolUse:read_file",
      "afterToolUse:true",
      "beforeModel:7",
      "afterModel",
      "afterAgentRun:success",
    ]);
    expect(uiEvents.map((event) => event.type)).toEqual([
      "text_delta",
      "thinking_delta",
      "tool_start",
      "tool_result",
      "text_delta",
      "turn_done",
    ]);
    expect(provider.inputs[1]?.messages.find((message) => message.role === "tool")?.content).toContain(
      "middleware supplied tool result",
    );
  });

  it("turns malformed final streamed tool arguments into a parse-error tool result", async () => {
    const provider = new StagedProvider([
      [
        { type: "tool_call_delta", id: "bad_args", name: "read_file", argumentsDelta: "{\"path\":", final: true },
        { type: "done" },
      ],
      [
        { type: "text_delta", text: "handled" },
        { type: "done" },
      ],
    ]);
    const toolResults: ToolResult[] = [];

    await runReactLoop({
      task: "bad tool",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      onToolResult(_toolUse, rawResult) {
        toolResults.push(rawResult);
      },
    });

    expect(toolResults[0]?.ok).toBe(false);
    expect(toolResults[0]?.error?.kind).toBe("parse_error");
    expect(provider.inputs[1]?.messages.find((message) => message.role === "tool")?.content).toContain(
      "parse_error",
    );
  });

  it("supports human question tools through the interaction manager", async () => {
    const manager = new HumanInteractionManager();
    manager.onRequest((request) => {
      if (request.type === "question") {
        manager.resolveQuestion(request.id, { direction: ["Implement"] });
      }
    });
    const provider = new StagedProvider([
      [
        {
          type: "tool_call",
          toolCall: {
            id: "ask_1",
            name: "ask_user_question",
            input: {
              questions: [
                {
                  id: "direction",
                  question: "What next?",
                  mode: "single",
                  options: [{ label: "Implement", description: "Write code" }],
                },
              ],
            },
          },
        },
        { type: "done" },
      ],
      [
        { type: "text_delta", text: "answered" },
        { type: "done" },
      ],
    ]);

    await runReactLoop({
      task: "ask",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry({ humanInteractionManager: manager }),
    });

    expect(provider.inputs[1]?.messages.find((message) => message.role === "tool")?.content).toContain(
      "Implement",
    );
  });

  it("lets approval middleware deny mutating tool use", async () => {
    const manager = new HumanInteractionManager();
    manager.onRequest((request) => {
      if (request.type === "approval") {
        manager.resolveApproval(request.id, false);
      }
    });
    const provider = new StagedProvider([
      [
        {
          type: "tool_call",
          toolCall: {
            id: "bash_1",
            name: "bash",
            input: { command: "printf should-not-run" },
          },
        },
        { type: "done" },
      ],
      [
        { type: "text_delta", text: "denied" },
        { type: "done" },
      ],
    ]);
    const toolResults: ToolResult[] = [];

    await runReactLoop({
      task: "deny",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      middleware: [createApprovalMiddleware({ manager })],
      onToolResult(_toolUse, rawResult) {
        toolResults.push(rawResult);
      },
    });

    expect(toolResults[0]?.ok).toBe(false);
    expect(toolResults[0]?.error?.kind).toBe("permission");
    expect(toolResults[0]?.output).not.toContain("should-not-run");
  });

  it("denies approval without an interaction manager and cleans up aborted HITL requests", async () => {
    const denied = await createApprovalMiddleware().beforeToolUse?.({
      sessionId: "session",
      cwd: process.cwd(),
      signal: new AbortController().signal,
      toolUse: {
        id: "bash_1",
        name: "bash",
        input: { command: "printf no" },
      },
    });
    expect(denied?.ok).toBe(false);
    expect(denied?.error?.kind).toBe("permission");

    const manager = new HumanInteractionManager();
    const controller = new AbortController();
    const pending = manager.requestApproval({ title: "Approve", body: "body" }, controller.signal);
    expect(manager.pendingCount()).toBe(1);
    controller.abort();
    await expect(pending).rejects.toThrow("Operation was aborted");
    expect(manager.pendingCount()).toBe(0);

    let questionId = "";
    const unsubscribe = manager.onRequest((request) => {
      if (request.type === "question") {
        questionId = request.id;
      }
    });
    const rejected = manager.askUserQuestion([
      {
        id: "direction",
        question: "What next?",
        mode: "single",
        options: [{ label: "Explore", description: "Clarify" }],
      },
    ]);
    expect(manager.pendingCount()).toBe(1);
    manager.reject("missing", new Error("ignored"));
    expect(manager.pendingCount()).toBe(1);
    unsubscribe();
    expect(questionId).toBeTruthy();
    manager.reject(questionId, new Error("denied"));
    await expect(rejected).rejects.toThrow("denied");
    expect(manager.pendingCount()).toBe(0);
  });

  it("emits bash progress events while preserving final model output", async () => {
    const provider = new StagedProvider([
      [
        {
          type: "tool_call",
          toolCall: {
            id: "bash_1",
            name: "bash",
            input: { command: "printf progress" },
          },
        },
        { type: "done" },
      ],
      [
        { type: "text_delta", text: "complete" },
        { type: "done" },
      ],
    ]);
    const uiEvents: UiEvent[] = [];

    const result = await runReactLoop({
      task: "progress",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      onUiEvent(event) {
        uiEvents.push(event);
      },
    });

    expect(result.assistantMessage.content).toBe("complete");
    expect(uiEvents.some((event) => event.type === "bash_progress" && event.output === "progress")).toBe(true);
  });

  it("batches render events and keeps plain renderer text on stdout", async () => {
    const stdout = createWritableCollector();
    const stderr = createWritableCollector();
    const flushed: UiEvent[] = [];
    const batcher = new RenderBatcher<UiEvent>({
      windowMs: 1000,
      isBoundaryEvent(event) {
        return event.type === "tool_start";
      },
      flush(events) {
        flushed.push(...events);
      },
    });

    batcher.enqueue({ type: "text_delta", delta: "hi" });
    batcher.enqueue({ type: "tool_start", id: "tool_1", name: "bash", summary: { title: "Bash", detail: "pwd" } });
    await batcher.flushNow();
    for (const event of flushed) {
      renderPlainUiEvent(event, { stdout: stdout.stream, stderr: stderr.stream });
    }

    expect(stdout.output()).toBe("hi");
    expect(stderr.output()).toContain("[tool] Bash: pwd");
  });

  it("keeps thinking deltas out of run-loop visible text and renderers", async () => {
    const provider = new StagedProvider([
      [
        { type: "thinking_delta", text: "secret", hidden: true },
        { type: "text_delta", text: "visible" },
        { type: "done" },
      ],
    ]);
    const stdout = createWritableCollector();
    const stderr = createWritableCollector();
    const uiEvents: UiEvent[] = [];

    const result = await runReactLoop({
      task: "hide thinking",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      onUiEvent(event) {
        uiEvents.push(event);
        renderPlainUiEvent(event, { stdout: stdout.stream, stderr: stderr.stream });
      },
    });

    expect(result.assistantMessage.content).toBe("visible");
    expect(stdout.output()).toBe("visible");
    expect(stdout.output()).not.toContain("secret");
    expect(uiEvents).toContainEqual({ type: "thinking_delta", delta: "secret", hidden: true });

    const turnState = applyTurnEvent(createTurnRendererState(), { type: "thinking_delta", delta: "secret", hidden: true });
    expect(turnState.text).toBe("");
  });

  it("splits hidden reasoning, summarizes tools, and tracks current-turn tool state", () => {
    expect(splitReasoningParts("a<think>b</think>c")).toEqual([
      { type: "text", text: "a" },
      { type: "thinking", text: "b", hidden: true },
      { type: "text", text: "c" },
    ]);

    const splitter = new StreamingReasoningSplitter();
    expect([
      ...splitter.push("pre<THI"),
      ...splitter.push("NK>secret</thi"),
      ...splitter.push("nk>mid<think>x"),
      ...splitter.push("</think>post"),
      ...splitter.flush(),
    ]).toEqual([
      { type: "text", text: "pre" },
      { type: "thinking", text: "secret", hidden: true },
      { type: "text", text: "mid" },
      { type: "thinking", text: "x", hidden: true },
      { type: "text", text: "post" },
    ]);

    const unclosed = new StreamingReasoningSplitter();
    expect([
      ...unclosed.push("visible<think>hidden"),
      ...unclosed.flush(),
    ]).toEqual([
      { type: "text", text: "visible" },
      { type: "thinking", text: "hidden", hidden: true },
    ]);

    const accumulator = new ToolAccumulator();
    expect(accumulator.append({ id: "call_1", name: "read_file" })).toEqual({ type: "partial", id: "call_1" });
    expect(accumulator.append({ id: "call_1", argumentsDelta: "{\"path\":\"package.json\"}" })).toEqual({
      type: "complete",
      toolUse: {
        id: "call_1",
        name: "read_file",
        input: { path: "package.json" },
      },
    });

    expect(accumulator.append({ id: "call_2", name: "read_file", argumentsDelta: "[]", final: true })).toMatchObject({
      type: "invalid",
      reason: "Tool arguments must be a JSON object",
    });

    const toolUse = {
      id: "bash_1",
      name: "bash",
      input: { command: "pwd", description: "print cwd" },
    };
    const summary = summarizeToolUse(toolUse);
    expect(summary).toEqual({ title: "Bash", detail: "print cwd: pwd" });

    const state = new ToolState();
    state.start(toolUse, summary);
    state.finish("bash_1", true, "ok");
    expect(state.list()).toMatchObject([{ id: "bash_1", status: "completed", ok: true }]);

    const projected = applyTurnEvent(
      applyTurnEvent(createTurnRendererState(), { type: "text_delta", delta: "hello" }),
      { type: "tool_start", id: "bash_1", name: "bash", summary },
    );
    expect(projected.text).toBe("hello");
    expect(projected.tools[0]?.summary).toEqual(summary);
  });

  it("emits abort UI events and reports aborted agent status", async () => {
    const controller = new AbortController();
    controller.abort();
    const uiEvents: UiEvent[] = [];
    const statuses: string[] = [];

    await expect(runReactLoop({
      task: "abort",
      model: "fixture-model",
      provider: new StagedProvider([[{ type: "done" }]]),
      toolRegistry: createDefaultToolRegistry(),
      signal: controller.signal,
      middleware: [
        {
          afterAgentRun(context) {
            statuses.push(context.status);
          },
        },
      ],
      onUiEvent(event) {
        uiEvents.push(event);
      },
    })).rejects.toThrow("Operation was aborted");

    expect(statuses).toEqual(["aborted"]);
    expect(uiEvents).toContainEqual({ type: "turn_aborted", reason: "aborted" });
  });

  it("runs Stage 03 fixture smoke paths through the CLI", async () => {
    const splitJson = await runFixtureCli("fixtures/tool-args-split-json.json", "read file");
    expect(splitJson.stdout).toContain("Split JSON tool args were assembled and executed.");
    expect(splitJson.stderr).toContain("[tool] Read file");

    const hiddenThinking = await runFixtureCli("fixtures/thinking-hidden.json", "answer");
    expect(hiddenThinking.stdout).toBe("Hidden thinking was suppressed from command output.\n");
    expect(hiddenThinking.stdout).not.toContain("hidden reasoning");

    const question = await runFixtureCli("fixtures/ask-user-question.json", "clarify");
    expect(question.stdout).toContain("Question request demo completed.");
    expect(question.stderr).toContain("No human interaction manager");

    const toolStream = await runFixtureCli("fixtures/tool-stream.json", "inspect file");
    expect(toolStream.stdout).toContain("Tool stream demo completed.");
    expect(toolStream.stderr).toContain("progress-demo");
  });
});

class StagedProvider implements ProviderAdapter {
  readonly inputs: ProviderInput[] = [];
  private index = 0;

  constructor(private readonly responses: ProviderEvent[][]) {}

  async *stream(input: ProviderInput): AsyncIterable<ProviderEvent> {
    this.inputs.push(input);
    const response = this.responses[this.index] ?? [];
    this.index += 1;
    for (const event of response) {
      yield event;
    }
  }
}

function createWritableCollector(): {
  stream: Writable;
  output(): string;
} {
  let text = "";
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        text += chunk.toString();
        callback();
      },
    }),
    output() {
      return text;
    },
  };
}

async function runFixtureCli(scriptPath: string, task: string): Promise<{ stdout: string; stderr: string }> {
  const stdout = createWritableCollector();
  const stderr = createWritableCollector();
  await main(
    ["run", "--provider", "fixture", "--script", scriptPath, task],
    {
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: process.cwd(),
    },
  );
  return {
    stdout: stdout.output(),
    stderr: stderr.output(),
  };
}
