import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDefaultToolRegistry,
  FixtureProvider,
  formatToolResultForModel,
  isRetryableProviderError,
  main,
  openSqliteSessionStore,
  ProviderError,
  renderPlainUiEvent,
  replaySessionPlain,
  retryDelayMs,
  runReactLoop,
  runTool,
  runWithRetry,
  type ExecutableToolUse,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderInput,
  type UiEvent,
} from "../src/index.js";

const tempDirs: string[] = [];
const hasBun = "Bun" in globalThis;
const bunIt = hasBun ? it : it.skip;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("stage-08 retry and recovery", () => {
  it("classifies retryable failures and computes bounded backoff", async () => {
    expect(isRetryableProviderError(new ProviderError("server", { status: 500 }))).toBe(true);
    expect(isRetryableProviderError(new ProviderError("rate limit", { status: 429 }))).toBe(true);
    expect(isRetryableProviderError(new ProviderError("bad request", { status: 400 }))).toBe(false);
    expect(isRetryableProviderError(new DOMException("Operation was aborted", "AbortError"))).toBe(false);
    expect(isRetryableProviderError(new TypeError("fetch failed"))).toBe(true);
    expect(retryDelayMs({ maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 15 }, 1)).toBe(10);
    expect(retryDelayMs({ maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 15 }, 2)).toBe(15);

    let attempts = 0;
    const result = await runWithRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new ProviderError("temporary", { status: 500 });
      }
      return "ok";
    }, {
      policy: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
      sleep: async () => {},
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);

    attempts = 0;
    await expect(runWithRetry(async () => {
      attempts += 1;
      throw new ProviderError("temporary", { status: 500 });
    }, {
      policy: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
      sleep: async () => {},
    })).rejects.toThrow("temporary");
    expect(attempts).toBe(2);
  });

  it("lets fixture provider scripts throw provider errors through the stream path", async () => {
    const provider = await FixtureProvider.fromFile(path.join(process.cwd(), "fixtures/provider/retry-success.json"));
    await expect(readAll(provider)).rejects.toThrow(ProviderError);
    expect(provider.inputs).toHaveLength(1);
  });

  it("retries provider failures before output without duplicating UI text", async () => {
    const provider = new ScriptedProvider([
      new ProviderError("temporary", { status: 500 }),
      [{ type: "text_delta", text: "retried" }, { type: "done" }],
    ]);
    const uiEvents: UiEvent[] = [];

    const result = await runReactLoop({
      task: "retry",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      retryPolicy: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
      retrySleep: async () => {},
      onUiEvent(event) {
        uiEvents.push(event);
      },
    });

    expect(result.assistantMessage.content).toBe("retried");
    expect(provider.inputs).toHaveLength(2);
    expect(uiEvents.filter((event) => event.type === "text_delta")).toEqual([{ type: "text_delta", delta: "retried" }]);
  });

  it("exhausts retry budget and emits concise turn errors", async () => {
    const provider = new ScriptedProvider([
      new ProviderError("temporary", { status: 500 }),
      new ProviderError("temporary", { status: 500 }),
    ]);
    const uiEvents: UiEvent[] = [];

    await expect(runReactLoop({
      task: "retry",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      retryPolicy: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
      retrySleep: async () => {},
      onUiEvent(event) {
        uiEvents.push(event);
      },
    })).rejects.toThrow("temporary");

    expect(provider.inputs).toHaveLength(2);
    expect(uiEvents).toContainEqual({
      type: "turn_error",
      summary: "Provider error (500): temporary",
    });
  });

  it("does not retry after partial output", async () => {
    const provider = new ScriptedProvider([
      [{ type: "text_delta", text: "partial" }, new ProviderError("failed after output", { status: 500 })],
    ]);
    const uiEvents: UiEvent[] = [];

    await expect(runReactLoop({
      task: "no retry",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      retryPolicy: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
      retrySleep: async () => {},
      onUiEvent(event) {
        uiEvents.push(event);
      },
    })).rejects.toThrow("failed after output");

    expect(provider.inputs).toHaveLength(1);
    expect(uiEvents).toContainEqual({ type: "text_delta", delta: "partial" });
    expect(uiEvents.some((event) => event.type === "turn_error")).toBe(true);
  });

  it("backfills provider failures after tool intent and continues with formatted tool result", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "tool_call", toolCall: { id: "call_read", name: "read_file", input: { path: "missing.txt" } } },
        new ProviderError("failed after tool intent", { status: 500 }),
      ],
      [{ type: "text_delta", text: "recovered" }, { type: "done" }],
    ]);
    const toolResults: string[] = [];

    const result = await runReactLoop({
      task: "recover",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      retryPolicy: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
      retrySleep: async () => {},
      onToolResult(_toolUse, _rawResult, modelContent) {
        toolResults.push(modelContent);
      },
    });

    expect(result.assistantMessage.content).toBe("recovered");
    expect(provider.inputs).toHaveLength(2);
    expect(toolResults[0]).toContain("\"ok\": false");
    expect(toolResults[0]).toContain("provider streaming failed");
    expect(provider.inputs[1]?.messages.find((message) => message.role === "tool")?.content).toContain("\"ok\": false");
  });

  it("backfills malformed final tool arguments without executing the tool", async () => {
    const provider = new ScriptedProvider([
      [
        { type: "tool_call_delta", id: "bad_args", name: "read_file", argumentsDelta: "{\"path\":", final: true },
        { type: "done" },
      ],
      [{ type: "text_delta", text: "handled" }, { type: "done" }],
    ]);
    const toolResults: string[] = [];

    const result = await runReactLoop({
      task: "bad args",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      onToolResult(_toolUse, _rawResult, modelContent) {
        toolResults.push(modelContent);
      },
    });

    expect(result.assistantMessage.content).toBe("handled");
    expect(toolResults[0]).toContain("\"kind\": \"parse_error\"");
    expect(provider.inputs[1]?.messages.find((message) => message.role === "tool")?.content).toContain("parse_error");
  });
});

describe("stage-08 bash, UI, CLI, and sessions", () => {
  it("normalizes bash non-zero exit, timeout, abort, large output, and formatter output", async () => {
    const cwd = await tempDir();
    const registry = createDefaultToolRegistry();

    const nonzero = await runTool(registry, toolUse("bash", { command: "printf nonzero; exit 7" }), context(cwd));
    expect(nonzero.ok).toBe(true);
    expect(nonzero.metadata?.bash).toMatchObject({ exitCode: 7, interrupted: false });

    const timeout = await runTool(
      registry,
      toolUse("bash", { command: "printf timeout-output; sleep 1", timeout: 30 }),
      context(cwd),
    );
    expect(timeout.ok).toBe(false);
    expect(timeout.error?.kind).toBe("timeout");
    expect(timeout.metadata?.bash).toMatchObject({ exitCode: null, interrupted: true, interruptedReason: "timeout" });
    expect(formatToolResultForModel("bash", timeout)).toContain("\"ok\": false");

    const abortController = new AbortController();
    setTimeout(() => abortController.abort(), 30);
    const aborted = await runTool(
      registry,
      toolUse("bash", { command: "sleep 1", timeout: 1_000 }),
      context(cwd, abortController.signal),
    );
    expect(aborted.ok).toBe(false);
    expect(aborted.error?.kind).toBe("interrupted");
    expect(aborted.metadata?.bash).toMatchObject({ exitCode: null, interrupted: true, interruptedReason: "abort" });

    const large = await runTool(
      registry,
      toolUse("bash", { command: "printf '%07000d' 0; sleep 1", timeout: 30 }),
      context(cwd),
    );
    const bash = large.metadata?.bash as { stdoutPreview?: string; outputBytes?: number } | undefined;
    expect(large.ok).toBe(false);
    expect(bash?.stdoutPreview).toContain("[truncated");
    expect(bash?.outputBytes).toBeGreaterThan(6000);
  });

  it("renders bounded failure UI while keeping hidden thinking hidden", () => {
    const stdout = createWritableCollector();
    const stderr = createWritableCollector();
    renderPlainUiEvent({ type: "thinking_delta", delta: "secret", hidden: true }, { stdout: stdout.stream, stderr: stderr.stream });
    renderPlainUiEvent({ type: "turn_error", summary: "Provider error (500): temporary" }, { stdout: stdout.stream, stderr: stderr.stream });
    renderPlainUiEvent({ type: "turn_aborted", reason: "aborted" }, { stdout: stdout.stream, stderr: stderr.stream });

    expect(stdout.output()).toBe("");
    expect(stderr.output()).toContain("[error] Provider error (500): temporary");
    expect(stderr.output()).toContain("[aborted] aborted");
    expect(stderr.output()).not.toContain("secret");
  });

  it("runs CLI fixture smoke paths for retry, backfill, and bash failures", async () => {
    const cwd = await tempDir();
    const retryOut = createWritableCollector();
    const retryFailedOut = createWritableCollector();
    const retryFailedErr = createWritableCollector();
    const backfillOut = createWritableCollector();
    const timeoutOut = createWritableCollector();
    const nonzeroOut = createWritableCollector();

    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/retry-success.json"),
      "retry",
    ], { cwd, stdout: retryOut.stream });
    await expect(main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/retry-exhausted.json"),
      "retry exhausted",
    ], { cwd, stdout: retryFailedOut.stream, stderr: retryFailedErr.stream })).rejects.toThrow("temporary provider failure");
    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/pending-tool-backfill.json"),
      "bad args",
    ], { cwd, stdout: backfillOut.stream });
    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/bash-timeout.json"),
      "timeout",
    ], { cwd, stdout: timeoutOut.stream });
    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/bash-nonzero.json"),
      "nonzero",
    ], { cwd, stdout: nonzeroOut.stream });

    expect(retryOut.output()).toBe("Retry succeeded.\n");
    expect(retryFailedOut.output()).toBe("");
    expect(retryFailedErr.output()).toContain("[error] Provider error (500): temporary provider failure");
    expect(retryFailedErr.output()).not.toContain("at ");
    expect(backfillOut.output()).toBe("Malformed tool call recovered.\n");
    expect(timeoutOut.output()).toBe("Handled timeout.\n");
    expect(nonzeroOut.output()).toBe("Handled non-zero exit.\n");
  });

  bunIt("records recovered failures and aborted turns in session transcripts", async () => {
    const cwd = await tempDir();
    const dbPath = path.join(cwd, "sessions.sqlite");
    const store = await openSqliteSessionStore(dbPath);
    try {
      const recoveredSession = store.createSession({ cwd });
      const recoveredProvider = await FixtureProvider.fromFile(path.join(process.cwd(), "fixtures/provider/pending-tool-backfill.json"));
      await runReactLoop({
        task: "bad args",
        model: "fixture-model",
        provider: recoveredProvider,
        cwd,
        sessionId: recoveredSession.id,
        sessionRecorder: store.createRecorder(recoveredSession.id),
        toolRegistry: createDefaultToolRegistry(),
      });
      const recoveredLoaded = store.loadSession(recoveredSession.id);
      const recoveredTool = recoveredLoaded?.messages.flatMap((message) => message.parts).find((part) =>
        part.type === "tool_result" && part.modelContent?.includes("parse_error")
      );
      expect(recoveredTool?.metadata.error).toMatchObject({ kind: "parse_error" });
      expect(replaySessionPlain(recoveredLoaded!)).toContain("read_file failed");

      const failedSession = store.createSession({ cwd });
      const failedProvider = await FixtureProvider.fromFile(path.join(process.cwd(), "fixtures/provider/retry-exhausted.json"));
      await expect(runReactLoop({
        task: "provider failure",
        model: "fixture-model",
        provider: failedProvider,
        cwd,
        sessionId: failedSession.id,
        sessionRecorder: store.createRecorder(failedSession.id),
        toolRegistry: createDefaultToolRegistry(),
        retryPolicy: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
        retrySleep: async () => {},
      })).rejects.toThrow("temporary provider failure");
      const failedLoaded = store.loadSession(failedSession.id);
      expect(replaySessionPlain(failedLoaded!)).toContain("turn error");

      const abortedSession = store.createSession({ cwd });
      const abortController = new AbortController();
      const abortProvider = new ScriptedProvider([
        [
          {
            type: "tool_call",
            toolCall: { id: "call_sleep", name: "bash", input: { command: "sleep 1", timeout: 1_000 } },
          },
          { type: "done" },
        ],
      ]);
      setTimeout(() => abortController.abort(), 30);
      await expect(runReactLoop({
        task: "abort bash",
        model: "fixture-model",
        provider: abortProvider,
        cwd,
        sessionId: abortedSession.id,
        sessionRecorder: store.createRecorder(abortedSession.id),
        toolRegistry: createDefaultToolRegistry(),
        signal: abortController.signal,
      })).rejects.toThrow("Operation was aborted");
      const abortedLoaded = store.loadSession(abortedSession.id);
      expect(replaySessionPlain(abortedLoaded!)).toContain("turn aborted");
    } finally {
      store.close();
    }
  });
});

async function readAll(provider: ProviderAdapter): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of provider.stream({ model: "fixture-model", messages: [] }, new AbortController().signal)) {
    events.push(event);
  }
  return events;
}

class ScriptedProvider implements ProviderAdapter {
  readonly inputs: ProviderInput[] = [];
  private index = 0;

  constructor(private readonly responses: Array<Array<ProviderEvent | Error> | Error>) {}

  async *stream(input: ProviderInput): AsyncIterable<ProviderEvent> {
    this.inputs.push(input);
    const response = this.responses[this.index] ?? [];
    this.index += 1;
    if (response instanceof Error) {
      throw response;
    }
    for (const event of response) {
      if (event instanceof Error) {
        throw event;
      }
      yield event;
    }
  }
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-stage08-test-"));
  tempDirs.push(dir);
  return dir;
}

function toolUse(name: string, input: Record<string, unknown>): ExecutableToolUse {
  return { id: `call_${name}`, name, input: input as ExecutableToolUse["input"] };
}

function context(cwd: string, signal = new AbortController().signal) {
  return {
    cwd,
    signal,
    sessionId: "test-session",
    toolCallId: "test-call",
    emit() {
      return undefined;
    },
  };
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
