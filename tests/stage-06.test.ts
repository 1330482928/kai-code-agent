import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  approvedPlanContextItemsFromSession,
  buildPromptDebugSnapshot,
  buildProfileContextItems,
  buildRuntimeContextItems,
  ContextManager,
  contextItemsFromLoadedSession,
  createContextItem,
  createDefaultToolRegistry,
  createExcludedContextItem,
  estimateTokens,
  exportSessionJsonl,
  loadInstructionItems,
  main,
  ModelInputBuilder,
  openSqliteSessionStore,
  planContextBudget,
  rebuildProviderMessages,
  renderPromptDebugText,
  replaySessionPlain,
  runReactLoop,
  selectRetainedTail,
  type LoadedSession,
  type ModelInputBuildResult,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderInput,
} from "../src/index.js";

const hasBun = "Bun" in globalThis;
const bunIt = hasBun ? it : it.skip;

describe("stage-06a context kernel", () => {
  it("creates context items and estimates tokens deterministically", () => {
    const item = createContextItem({
      kind: "instruction",
      source: { type: "file", path: "/repo/AGENTS.md" },
      content: "Read code before edits.",
      priority: 20,
      metadata: { path: "/repo/AGENTS.md" },
    });
    expect(item).toMatchObject({
      id: "instruction:file-/repo/agents.md",
      included: true,
      source: "file:/repo/AGENTS.md",
    });
    expect(item.cacheStable).toBeUndefined();

    const excluded = createExcludedContextItem({
      kind: "history",
      source: "session.thinking",
      content: "hidden",
      priority: 100,
      cutReason: "disabled",
    });
    expect(excluded.included).toBe(false);
    expect(excluded.cutReason).toBe("disabled");
    expect(estimateTokens("hello world")).toBe(2);
    expect(estimateTokens("你好")).toBe(2);
  });

  it("loads profile, instruction, runtime, and prompt metadata context", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-stage06-context-"));
    try {
      await writeFile(path.join(dir, "package.json"), "{}");
      await writeFile(path.join(dir, "AGENTS.md"), "root rules");
      const nested = path.join(dir, "src", "feature");
      await mkdir(nested, { recursive: true });
      await writeFile(path.join(nested, "CLAUDE.md"), "nested rules");

      const instructions = await loadInstructionItems({ cwd: nested });
      expect(instructions.map((item) => path.basename(String(item.metadata?.path)))).toEqual([
        "AGENTS.md",
        "CLAUDE.md",
      ]);
      expect(instructions[0]?.content).toBe("root rules");
      expect(instructions[1]?.content).toBe("nested rules");

      const buildProfile = buildProfileContextItems("build")[0];
      const planProfile = buildProfileContextItems("plan")[0];
      expect(buildProfile?.content).toContain("Active profile: build");
      expect(planProfile?.content).toContain("Active profile: plan");

      const runtime = await buildRuntimeContextItems({
        cwd: nested,
        includeGit: true,
        now: () => new Date("2026-05-13T00:00:00.000Z"),
      });
      expect(runtime[0]?.content).toContain(`cwd: ${nested}`);
      expect(runtime[0]?.content).toContain("date: 2026-05-13T00:00:00.000Z");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("projects transcript history, tool results, thinking exclusion, and approved plans", () => {
    const loaded = createLoadedSession("approved");
    const items = contextItemsFromLoadedSession(loaded);
    expect(items.some((item) => item.kind === "history" && item.content === "remember alpha")).toBe(true);
    expect(items.find((item) => item.id.endsWith(":thinking"))).toMatchObject({
      included: false,
      cutReason: "disabled",
    });
    expect(items.find((item) => item.kind === "tool_result")?.content).toBe("stored model content");

    const planItems = approvedPlanContextItemsFromSession(loaded, "build");
    expect(planItems).toHaveLength(1);
    expect(planItems[0]?.kind).toBe("plan");
    expect(planItems[0]?.content).toContain("Approved implementation plan");
    expect(approvedPlanContextItemsFromSession(loaded, "plan")).toHaveLength(0);

    const rejected = createLoadedSession("rejected");
    expect(approvedPlanContextItemsFromSession(rejected, "build")).toHaveLength(0);

    const rebuilt = rebuildProviderMessages(loaded);
    expect(rebuilt[0]).toMatchObject({ role: "system" });
    expect(JSON.stringify(rebuilt)).not.toContain("secret");
    expect(rebuilt.find((message) => message.role === "tool")?.content).toBe("stored model content");
  });

  it("builds deterministic provider input with system context, tools, and debug metadata", () => {
    const tools = createDefaultToolRegistry().providerSchemas();
    const builder = new ModelInputBuilder({
      maxOutputTokens: 1234,
      budget: { maxInputTokens: 9000 },
    });
    const first = builder.build({
      model: "fixture-model",
      tools,
      items: [
        createContextItem({ kind: "current_user", source: "prompt", content: "do it", priority: 1000, metadata: { role: "user" } }),
        createContextItem({ kind: "profile", source: "profile.build", content: "build profile", priority: 10 }),
        createContextItem({ kind: "base", source: "base", content: "base rules", priority: 0 }),
      ],
    });
    const second = builder.build({
      model: "fixture-model",
      tools,
      items: [
        createContextItem({ kind: "current_user", source: "prompt", content: "do it", priority: 1000, metadata: { role: "user" } }),
        createContextItem({ kind: "profile", source: "profile.build", content: "build profile", priority: 10 }),
        createContextItem({ kind: "base", source: "base", content: "base rules", priority: 0 }),
      ],
    });

    expect(first.providerInput).toEqual(second.providerInput);
    expect(first.messages.map((message) => message.role)).toEqual(["system", "system", "user"]);
    expect(first.tools.map((tool) => tool.function.name)).toContain("read_file");
    expect(first.generation.maxOutputTokens).toBe(1234);
    expect(first.debug.items.map((item) => item.kind)).toEqual(["base", "profile", "current_user"]);
    expect(first.debug.estimatedInputTokens).toBeGreaterThan(0);
  });

  it("runs provider calls through ModelInputBuilder while preserving tool continuation", async () => {
    const provider = new StagedProvider([
      [
        { type: "tool_call", toolCall: { id: "read_1", name: "read_file", input: { path: "package.json", limit: 80 } } },
        { type: "done" },
      ],
      [
        { type: "text_delta", text: "done" },
        { type: "done" },
      ],
    ]);
    const builds: ModelInputBuildResult[] = [];

    const result = await runReactLoop({
      task: "read package",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      cwd: process.cwd(),
      contextOptions: {
        includeInstructions: false,
        includeRuntime: false,
      },
      onContextBuild(build) {
        builds.push(build);
      },
    });

    expect(result.assistantMessage.content).toBe("done");
    expect(builds).toHaveLength(2);
    expect(builds[0]?.items.map((item) => item.kind)).toContain("base");
    expect(builds[0]?.items.map((item) => item.kind)).toContain("profile");
    expect(builds[0]?.providerInput.messages.some((message) => message.role === "system")).toBe(true);
    expect(builds[0]?.providerInput.messages.some((message) => message.role === "user" && message.content === "read package")).toBe(true);
    expect(builds[1]?.providerInput.messages.some((message) => message.role === "tool")).toBe(true);
    expect(provider.inputs[1]?.messages.some((message) => message.role === "tool")).toBe(true);
  });

  it("combines loaded session history and current user without duplicating approved plan context", async () => {
    const provider = new StagedProvider([[{ type: "text_delta", text: "continued" }, { type: "done" }]]);
    const builds: ModelInputBuildResult[] = [];

    await runReactLoop({
      task: "continue",
      model: "fixture-model",
      provider,
      loadedSession: createLoadedSession("approved"),
      cwd: process.cwd(),
      contextOptions: {
        includeInstructions: false,
        includeRuntime: false,
      },
      onContextBuild(build) {
        builds.push(build);
      },
    });

    const input = provider.inputs[0];
    const approvedSystemMessages = input?.messages.filter((message) =>
      message.role === "system" && message.content.includes("Approved implementation plan")
    ) ?? [];
    expect(approvedSystemMessages).toHaveLength(1);
    expect(input?.messages.some((message) => message.role === "user" && message.content === "remember alpha")).toBe(true);
    expect(input?.messages.some((message) => message.role === "user" && message.content === "continue")).toBe(true);
    expect(builds[0]?.items.filter((item) => item.kind === "plan")).toHaveLength(1);
  });
});

describe("stage-06b context compaction and prompt debug", () => {
  it("plans budget decisions with caps, sticky items, and stable cut reasons", () => {
    const plan = planContextBudget({
      budget: {
        maxInputTokens: 16,
        reservedOutputTokens: 4,
        compactThreshold: 0.5,
        perKindMaxTokens: { history: 4 },
      },
      items: [
        createContextItem({
          id: "base",
          kind: "base",
          source: "base",
          content: "base rules",
          priority: 0,
          sticky: true,
        }),
        createContextItem({
          id: "old",
          kind: "history",
          source: "session.old",
          content: "one two three four five six seven",
          priority: 100,
          metadata: { role: "user", messageId: "msg_old" },
        }),
        createContextItem({
          id: "current",
          kind: "current_user",
          source: "prompt",
          content: "current task",
          priority: 1000,
          sticky: true,
          metadata: { role: "user" },
        }),
      ],
    });

    expect(plan.debug.shouldCompact).toBe(true);
    expect(plan.items.find((item) => item.id === "base")?.included).toBe(true);
    expect(plan.items.find((item) => item.id === "current")?.included).toBe(true);
    const old = plan.items.find((item) => item.id === "old");
    expect(old?.included).toBe(true);
    expect(old?.metadata?.budget).toMatchObject({ truncated: true, reason: "over_kind_budget" });
  });

  it("selects retained tail without splitting tool call/result pairs", () => {
    const assistant = createContextItem({
      id: "assistant-tool",
      kind: "history",
      source: "session.1",
      content: "",
      priority: 1,
      metadata: {
        role: "assistant",
        messageId: "msg_assistant",
        toolCalls: [{ id: "call_1", name: "read_file", input: { path: "package.json" } }],
      },
    });
    const tool = createContextItem({
      id: "tool-result",
      kind: "tool_result",
      source: "session.2",
      content: "tool result content that is larger than the tiny budget",
      priority: 2,
      metadata: {
        role: "tool",
        messageId: "msg_tool",
        toolCallId: "call_1",
        name: "read_file",
      },
    });

    const selection = selectRetainedTail([assistant, tool], 1);
    expect(selection.preservedItemIds).toEqual(["assistant-tool", "tool-result"]);
    expect(selection.preservedMessageIds).toEqual(["msg_assistant", "msg_tool"]);
    expect(selection.segments[0]).toMatchObject({ protected: true, reason: "tool_pair" });
  });

  bunIt("compacts session history into a persisted summary and projects summary plus tail", async () => {
    const store = await openSqliteSessionStore(":memory:");
    try {
      const session = store.createSession({ id: "sess_compact", cwd: process.cwd() });
      const oldUser = store.appendMessage({ sessionId: session.id, role: "user" });
      store.appendPart({ messageId: oldUser.id, type: "text", text: "old alpha beta gamma delta epsilon zeta eta theta" });
      const oldAssistant = store.appendMessage({ sessionId: session.id, role: "assistant" });
      store.appendPart({ messageId: oldAssistant.id, type: "text", text: "old answer with decisions and files" });
      const tailUser = store.appendMessage({ sessionId: session.id, role: "user" });
      store.appendPart({ messageId: tailUser.id, type: "text", text: "recent request" });

      const loaded = store.loadSession(session.id);
      expect(loaded).toBeTruthy();
      const provider = new StagedProvider([
        [
          { type: "text_delta", text: "# Current Goal\nContinue.\n# Progress\nSummarized.\n# Decisions / Constraints\nKeep files.\n# Critical Files / Commands / Errors\npackage.json\n# Remaining Work\nAnswer." },
          { type: "done" },
        ],
      ]);
      const manager = new ContextManager({
        budget: { maxInputTokens: 28, reservedOutputTokens: 4, compactThreshold: 0.2 },
        tailTokenBudget: 3,
      });
      const build = await manager.build({
        model: "fixture-model",
        provider,
        signal: new AbortController().signal,
        loadedSession: loaded,
        sessionRecorder: store.createRecorder(session.id),
        profileName: "build",
        items: [
          ...contextItemsFromLoadedSession(loaded),
          createContextItem({
            id: "current",
            kind: "current_user",
            source: "prompt",
            content: "what next?",
            priority: 1000,
            sticky: true,
            metadata: { role: "user" },
          }),
        ],
      });

      expect(build.debug.compaction).toMatchObject({ decision: "compacted" });
      expect(build.providerInput.messages.some((message) =>
        message.role === "system" && message.content.includes("Conversation summary")
      )).toBe(true);
      expect(provider.inputs).toHaveLength(1);

      const compacted = store.loadSession(session.id)!;
      const summaryParts = compacted.messages.flatMap((message) => message.parts).filter((part) =>
        part.type === "summary" && part.metadata.kind === "compaction"
      );
      expect(summaryParts).toHaveLength(1);
      const projected = contextItemsFromLoadedSession(compacted);
      expect(projected.some((item) => item.kind === "summary" && item.content.includes("Current Goal"))).toBe(true);
      expect(projected.some((item) => item.metadata?.messageId === oldUser.id)).toBe(false);
      expect(exportSessionJsonl(compacted)).toContain("\"kind\":\"compaction\"");
      expect(replaySessionPlain(compacted)).toContain("context compacted");

      const recorder = store.createRecorder(session.id);
      const first = recorder.recordCompactionSummary({
        summary: "duplicate",
        sourceMessageIds: [oldUser.id],
        preservedMessageIds: [tailUser.id],
      });
      const second = recorder.recordCompactionSummary({
        summary: "duplicate",
        sourceMessageIds: [oldUser.id],
        preservedMessageIds: [tailUser.id],
      });
      expect(second).toMatchObject({ messageId: first.messageId, partId: first.partId, reused: true });
    } finally {
      store.close();
    }
  });

  it("renders read-only prompt debug snapshots safely and deterministically", async () => {
    const loaded = createLoadedSession("rejected");
    const thinkingPart = loaded.messages[1]?.parts[0];
    if (thinkingPart) {
      thinkingPart.text = "hidden debug secret";
    }
    const manager = new ContextManager({
      budget: { maxInputTokens: 20, reservedOutputTokens: 4, compactThreshold: 0.2 },
      readOnly: true,
    });
    const build = await manager.build({
      model: "fixture-model",
      loadedSession: loaded,
      items: [
        ...contextItemsFromLoadedSession(loaded),
        createContextItem({
          id: "current",
          kind: "current_user",
          source: "prompt",
          content: "sk-api-secret-token explain",
          priority: 1000,
          metadata: { role: "user" },
        }),
      ],
    });
    const first = buildPromptDebugSnapshot({ build, showItems: true });
    const second = buildPromptDebugSnapshot({ build, showItems: true });
    expect(first).toEqual(second);
    const rendered = renderPromptDebugText(first);
    expect(rendered).toContain("Prompt Debug");
    expect(rendered).toContain("sk-********");
    expect(rendered).not.toContain("sk-api-secret-token");
    expect(rendered).not.toContain("hidden debug secret");
  });

  it("supports kai prompt --debug in text and json modes without provider requests", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-stage06b-cli-"));
    const dbPath = path.join(dir, "sessions.sqlite");
    try {
      const textOut = createWritableCollector();
      await main([
        "prompt",
        "--debug",
        "--show-items",
        "--max-input-tokens",
        "24",
        "sk-api-cli-secret explain",
      ], {
        stdout: textOut.stream,
        stderr: createWritableCollector().stream,
        sessionDbPath: dbPath,
        cwd: process.cwd(),
        configPath: path.join(dir, "missing-config.yaml"),
      });
      expect(textOut.output()).toContain("Prompt Debug");
      expect(textOut.output()).toContain("sk-********");
      expect(textOut.output()).not.toContain("sk-api-cli-secret");

      const jsonOut = createWritableCollector();
      await main([
        "prompt",
        "--debug",
        "--json",
        "plain task",
      ], {
        stdout: jsonOut.stream,
        stderr: createWritableCollector().stream,
        sessionDbPath: dbPath,
        cwd: process.cwd(),
        configPath: path.join(dir, "missing-config.yaml"),
      });
      const parsed = JSON.parse(jsonOut.output()) as { provider?: { model?: string }; items?: unknown[] };
      expect(parsed.provider?.model).toBe("debug-model");
      expect(Array.isArray(parsed.items)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function createLoadedSession(planStatus: "approved" | "rejected"): LoadedSession {
  return {
    session: {
      id: `sess_${planStatus}`,
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
      cwd: process.cwd(),
      metadata: {},
    },
    messages: [
      {
        id: "msg_user",
        sessionId: `sess_${planStatus}`,
        role: "user",
        ordinal: 0,
        createdAt: "2026-05-13T00:00:00.000Z",
        metadata: {},
        parts: [
          {
            id: "part_user",
            messageId: "msg_user",
            ordinal: 0,
            type: "text",
            text: "remember alpha",
            metadata: {},
            createdAt: "2026-05-13T00:00:00.000Z",
          },
        ],
      },
      {
        id: "msg_assistant",
        sessionId: `sess_${planStatus}`,
        role: "assistant",
        ordinal: 1,
        createdAt: "2026-05-13T00:00:00.000Z",
        metadata: {},
        parts: [
          {
            id: "part_thinking",
            messageId: "msg_assistant",
            ordinal: 0,
            type: "thinking",
            text: "secret",
            metadata: { hidden: true },
            createdAt: "2026-05-13T00:00:00.000Z",
          },
          {
            id: "part_tool_call",
            messageId: "msg_assistant",
            ordinal: 1,
            type: "tool_call",
            text: "package.json",
            metadata: { toolCallId: "call_1", name: "read_file", input: { path: "package.json" } },
            createdAt: "2026-05-13T00:00:00.000Z",
          },
        ],
      },
      {
        id: "msg_tool",
        sessionId: `sess_${planStatus}`,
        role: "tool",
        ordinal: 2,
        createdAt: "2026-05-13T00:00:00.000Z",
        metadata: { toolCallId: "call_1", name: "read_file", ok: true },
        parts: [
          {
            id: "part_tool_result",
            messageId: "msg_tool",
            ordinal: 0,
            type: "tool_result",
            text: "summary",
            modelContent: "stored model content",
            metadata: { toolCallId: "call_1", name: "read_file", ok: true },
            createdAt: "2026-05-13T00:00:00.000Z",
          },
        ],
      },
      {
        id: "msg_plan",
        sessionId: `sess_${planStatus}`,
        role: "tool",
        ordinal: 3,
        createdAt: "2026-05-13T00:00:00.000Z",
        metadata: { kind: "plan", status: planStatus, planPath: "/tmp/plan.md" },
        parts: [
          {
            id: "part_plan",
            messageId: "msg_plan",
            ordinal: 0,
            type: "summary",
            text: `plan ${planStatus}: /tmp/plan.md`,
            modelContent: "plan model content",
            metadata: {
              kind: "plan",
              status: planStatus,
              planPath: "/tmp/plan.md",
              ...(planStatus === "approved" ? { approvedPlan: "# Plan\n\n- Do it" } : {}),
            },
            createdAt: "2026-05-13T00:00:00.000Z",
          },
        ],
      },
    ],
  };
}

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
