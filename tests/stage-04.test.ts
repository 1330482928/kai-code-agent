import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  applyChatTurnEvent,
  applyCommandInput,
  createChatShellState,
  createCommandInputState,
  createDefaultCommandRegistry,
  createDefaultToolRegistry,
  createInputEditorState,
  exportSessionJsonl,
  main,
  openSqliteSessionStore,
  projectTranscriptHistory,
  rebuildProviderMessages,
  reduceInputEditor,
  replaySessionPlain,
  runReactLoop,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderInput,
} from "../src/index.js";

const hasBun = "Bun" in globalThis;
const bunIt = hasBun ? it : it.skip;

describe("stage-04 session persistence", () => {
  bunIt("initializes, appends ordered records, and reopens a SQLite session store", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-stage04-store-"));
    const dbPath = path.join(dir, "sessions.sqlite");
    try {
      let store = await openSqliteSessionStore(dbPath);
      const session = store.createSession({ id: "sess_test", cwd: "/tmp/work", title: "Test" });
      const user = store.appendMessage({ sessionId: session.id, role: "user", summary: "hello" });
      store.appendPart({ messageId: user.id, type: "text", text: "hello" });
      const assistant = store.appendMessage({ sessionId: session.id, role: "assistant", summary: "world" });
      store.appendPart({ messageId: assistant.id, type: "thinking", text: "secret", metadata: { hidden: true } });
      store.appendPart({ messageId: assistant.id, type: "text", text: "world" });
      store.close();

      store = await openSqliteSessionStore(dbPath);
      const loaded = store.loadSession("sess_test");
      expect(loaded?.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
      expect(loaded?.messages[1]?.parts.map((part) => part.type)).toEqual(["thinking", "text"]);
      expect(store.listSessions()[0]).toMatchObject({ id: "sess_test", messageCount: 2 });
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  bunIt("rebuilds provider messages while preserving tool modelContent and hiding thinking", async () => {
    const store = await openSqliteSessionStore(":memory:");
    try {
      const session = store.createSession({ id: "sess_rebuild", cwd: process.cwd() });
      const user = store.appendMessage({ sessionId: session.id, role: "user" });
      store.appendPart({ messageId: user.id, type: "text", text: "remember alpha" });
      const assistant = store.appendMessage({ sessionId: session.id, role: "assistant" });
      store.appendPart({ messageId: assistant.id, type: "thinking", text: "secret", metadata: { hidden: true } });
      store.appendPart({
        messageId: assistant.id,
        type: "tool_call",
        metadata: { toolCallId: "call_1", name: "read_file", input: { path: "package.json" } },
      });
      const tool = store.appendMessage({ sessionId: session.id, role: "tool" });
      store.appendPart({
        messageId: tool.id,
        type: "tool_result",
        text: "summary",
        modelContent: "stored model content",
        metadata: { toolCallId: "call_1", name: "read_file", ok: true },
      });
      const loaded = store.loadSession(session.id);
      expect(loaded).toBeTruthy();

      const messages = rebuildProviderMessages(loaded!);
      expect(messages).toEqual([
        { role: "user", content: "remember alpha" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "read_file", input: { path: "package.json" } }],
        },
        { role: "tool", content: "stored model content", toolCallId: "call_1", name: "read_file" },
      ]);
      expect(JSON.stringify(messages)).not.toContain("secret");
      expect(projectTranscriptHistory(loaded!).map((item) => item.text).join("\n")).not.toContain("secret");
      expect(exportSessionJsonl(loaded!)).toContain("\"recordType\":\"part\"");
      expect(replaySessionPlain(loaded!)).not.toContain("secret");
    } finally {
      store.close();
    }
  });

  bunIt("records run-loop user, assistant, tool result, parse errors, and bash metadata", async () => {
    const store = await openSqliteSessionStore(":memory:");
    try {
      const session = store.createSession({ id: "sess_loop", cwd: process.cwd() });
      const provider = new StagedProvider([
        [
          { type: "thinking_delta", text: "hidden", hidden: true },
          {
            type: "tool_call",
            toolCall: { id: "bash_1", name: "bash", input: { command: "printf stage04" } },
          },
          { type: "done" },
        ],
        [
          { type: "text_delta", text: "done" },
          { type: "done" },
        ],
      ]);

      await runReactLoop({
        task: "run bash",
        model: "fixture-model",
        provider,
        toolRegistry: createDefaultToolRegistry(),
        sessionId: session.id,
        sessionRecorder: store.createRecorder(session.id),
        cwd: process.cwd(),
      });

      const loaded = store.loadSession(session.id);
      const parts = loaded?.messages.flatMap((message) => message.parts) ?? [];
      expect(loaded?.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"]);
      expect(parts.some((part) => part.type === "thinking" && part.text === "hidden")).toBe(true);
      const toolResult = parts.find((part) => part.type === "tool_result");
      expect(toolResult?.modelContent).toContain("stage04");
      expect(toolResult?.metadata.bash).toMatchObject({
        command: "printf stage04",
        cwd: process.cwd(),
        interrupted: false,
      });

      const parseSession = store.createSession({ id: "sess_parse", cwd: process.cwd() });
      await runReactLoop({
        task: "bad args",
        model: "fixture-model",
        provider: new StagedProvider([
          [
            { type: "tool_call_delta", id: "bad", name: "read_file", argumentsDelta: "{\"path\":", final: true },
            { type: "done" },
          ],
          [
            { type: "text_delta", text: "handled" },
            { type: "done" },
          ],
        ]),
        toolRegistry: createDefaultToolRegistry(),
        sessionId: parseSession.id,
        sessionRecorder: store.createRecorder(parseSession.id),
      });
      const parseParts = store.loadSession(parseSession.id)?.messages.flatMap((message) => message.parts) ?? [];
      expect(parseParts.find((part) => part.type === "tool_result")?.metadata.error).toMatchObject({
        kind: "parse_error",
      });

      await runReactLoop({
        task: "no recorder",
        model: "fixture-model",
        provider: new StagedProvider([[{ type: "text_delta", text: "ok" }, { type: "done" }]]),
      });

      await expect(runReactLoop({
        task: "recorder failure",
        model: "fixture-model",
        provider: new StagedProvider([[{ type: "text_delta", text: "ok" }, { type: "done" }]]),
        sessionRecorder: {
          recordUserMessage() {
            throw new Error("persist failed");
          },
          recordAssistantMessage() {},
          recordToolResult() {},
          completeTurn() {},
        },
      })).rejects.toThrow("persist failed");
    } finally {
      store.close();
    }
  });

  bunIt("supports CLI run, resume, sessions, export, replay, and missing session errors", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-stage04-cli-"));
    const dbPath = path.join(dir, "sessions.sqlite");
    try {
      const stdout = createWritableCollector();
      const stderr = createWritableCollector();
      await main([
        "run",
        "--provider",
        "fixture",
        "--session",
        "new",
        "--script",
        path.join(process.cwd(), "fixtures/session-alpha.json"),
        "remember alpha",
      ], { stdout: stdout.stream, stderr: stderr.stream, sessionDbPath: dbPath, cwd: process.cwd() });
      const sessionId = /Session: (\S+)/.exec(stderr.output())?.[1];
      expect(sessionId).toBeTruthy();
      expect(stdout.output()).toBe("remembered alpha\n");

      const resumeOut = createWritableCollector();
      await main([
        "resume",
        "--provider",
        "fixture",
        "--script",
        path.join(process.cwd(), "fixtures/session-resume.json"),
        sessionId!,
        "what did I say?",
      ], { stdout: resumeOut.stream, sessionDbPath: dbPath, cwd: process.cwd() });
      expect(resumeOut.output()).toBe("you said alpha\n");

      const bashOut = createWritableCollector();
      await main([
        "run",
        "--provider",
        "fixture",
        "--session",
        sessionId!,
        "--script",
        path.join(process.cwd(), "fixtures/bash.json"),
        "run pwd",
      ], { stdout: bashOut.stream, stderr: createWritableCollector().stream, sessionDbPath: dbPath, cwd: process.cwd() });
      expect(bashOut.output()).toBe("Ran pwd through fixture tool loop.\n");

      const listOut = createWritableCollector();
      await main(["sessions"], { stdout: listOut.stream, sessionDbPath: dbPath });
      expect(listOut.output()).toContain(sessionId);

      const exportOut = createWritableCollector();
      await main(["sessions", "export", sessionId!], { stdout: exportOut.stream, sessionDbPath: dbPath });
      expect(exportOut.output()).toContain("\"recordType\":\"session\"");
      expect(exportOut.output()).not.toContain("sk-");

      const replayOut = createWritableCollector();
      await main(["sessions", "replay", sessionId!], { stdout: replayOut.stream, sessionDbPath: dbPath });
      expect(replayOut.output()).toContain("User: remember alpha");

      await expect(main(["resume", "--provider", "fixture", "--script", path.join(process.cwd(), "fixtures/session-resume.json"), "missing", "hello"], {
        stdout: createWritableCollector().stream,
        sessionDbPath: dbPath,
      })).rejects.toThrow("Session not found: missing");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("stage-04 command input and chat shell", () => {
  it("edits text, bounds cursor movement, deletes characters, and navigates history", () => {
    let state = createInputEditorState({ history: ["first", "second"] });
    state = reduceInputEditor(state, { type: "insert", text: "abc" });
    state = reduceInputEditor(state, { type: "move_left" });
    state = reduceInputEditor(state, { type: "backspace" });
    expect(state.text).toBe("ac");
    state = reduceInputEditor(state, { type: "delete" });
    expect(state.text).toBe("a");
    state = reduceInputEditor(state, { type: "history_prev" });
    expect(state.text).toBe("second");
    state = reduceInputEditor(state, { type: "history_prev" });
    expect(state.text).toBe("first");
    state = reduceInputEditor(state, { type: "history_next" });
    expect(state.text).toBe("second");
  });

  it("opens slash picker, navigates, accepts commands, submits metadata, and aborts running turns", () => {
    const registry = createDefaultCommandRegistry();
    let state = createCommandInputState({ registry });
    let result = applyCommandInput(state, "/", {}, { registry });
    state = result.state;
    expect(state.picker.open).toBe(true);
    result = applyCommandInput(state, "", { downArrow: true }, { registry });
    state = result.state;
    expect(state.picker.selectedIndex).toBe(1);
    result = applyCommandInput(state, "", { escape: true }, { registry });
    expect(result.state.picker.open).toBe(false);

    state = createCommandInputState({ registry });
    result = applyCommandInput(state, "/plan inspect", {}, { registry });
    state = result.state;
    result = applyCommandInput(state, "", { return: true }, { registry });
    expect(result.output).toEqual({
      type: "submit",
      submission: {
        text: "inspect",
        metadata: { slashCommand: "plan", requestedMode: "plan", requestedProfile: "plan" },
      },
    });

    result = applyCommandInput(createCommandInputState({ registry }), "c", { ctrl: true }, { registry, running: true });
    expect(result.output).toEqual({ type: "abort_turn" });
  });

  it("projects chat shell state from transcript and current-turn events without exposing thinking", () => {
    const state = createChatShellState({
      sessionId: "sess_chat",
      input: createCommandInputState(),
    });
    const withText = applyChatTurnEvent(state, { type: "text_delta", delta: "hello" });
    expect(withText.currentTurn.text).toBe("hello");
    const withThinking = applyChatTurnEvent(withText, { type: "thinking_delta", delta: "secret", hidden: true });
    expect(withThinking.currentTurn.text).toBe("hello");
    const done = applyChatTurnEvent(withThinking, { type: "turn_done" });
    expect(done.currentTurn.text).toBe("");
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
