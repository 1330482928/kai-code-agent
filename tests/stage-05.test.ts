import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  applyCommandInput,
  createCommandInputState,
  createDefaultCommandRegistry,
  createPlanGuardMiddleware,
  createPlanTools,
  createProfileToolRegistry,
  createTurnRendererState,
  HumanInteractionManager,
  isReadonlyBashCommand,
  main,
  PlanStore,
  rebuildProviderMessages,
  resolveAgentProfileName,
  runReactLoop,
  type AgentProfileName,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderInput,
  type ToolResult,
  type UiEvent,
} from "../src/index.js";

const hasBun = "Bun" in globalThis;
const bunIt = hasBun ? it : it.skip;

describe("stage-05 agent profiles and plan tools", () => {
  it("resolves profiles and builds profile-specific tool schemas", async () => {
    expect(resolveAgentProfileName()).toBe("build");
    expect(resolveAgentProfileName({
      promptSubmission: { text: "plan", metadata: { requestedProfile: "plan" } },
    })).toBe("plan");
    expect(() => resolveAgentProfileName({
      promptSubmission: { text: "bad", metadata: { requestedProfile: "unknown" } },
    })).toThrow("Unsupported agent profile");

    const dir = await mkdtemp(path.join(tmpdir(), "kai-stage05-profile-"));
    try {
      const store = new PlanStore({ cwd: dir });
      let profile: AgentProfileName = "build";
      const registry = createProfileToolRegistry({
        profileName: "build",
        planRuntime: { store, getProfile: () => profile },
      });
      expect(registry.providerSchemas().map((schema) => schema.function.name)).toEqual([
        "read_file",
        "write_file",
        "edit_file",
        "grep",
        "glob",
        "apply_patch",
        "bash",
        "bash_status",
        "ask_user_question",
        "plan_enter",
      ]);
      profile = "plan";
      const planRegistry = createProfileToolRegistry({
        profileName: "plan",
        planRuntime: { store, getProfile: () => profile },
      });
      expect(planRegistry.providerSchemas().map((schema) => schema.function.name)).toEqual([
        "read_file",
        "grep",
        "glob",
        "bash",
        "bash_status",
        "ask_user_question",
        "plan_enter",
        "plan_write",
        "plan_exit",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates, writes, reads, previews, and finds plan files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-stage05-plan-store-"));
    try {
      const store = new PlanStore({ cwd: dir, userPlanDir: path.join(dir, "user-plans") });
      const written = await store.writePlan({
        sessionId: "sess_plan",
        slugSource: "Investigate Bug",
        content: "# Plan\n\n- Read code\n- Test fix",
      });
      expect(written.path).toContain(path.join(".kai", "plans"));
      expect(written.bytes).toBeGreaterThan(0);
      expect(written.preview).toContain("Read code");
      const read = await store.readPlan("sess_plan");
      expect(read.content).toContain("Test fix");
      const otherSessionPlan = await store.ensurePlan("sess_other", "other plan");
      expect(otherSessionPlan.path).not.toBe(written.path);
      store.activatePlan("sess_resumed", written.path);
      const resumedRead = await store.readPlan("sess_resumed");
      expect(resumedRead.content).toContain("Test fix");
      const latest = await store.findLatestPlan("sess_plan");
      expect(latest?.path).toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("executes plan tools and returns structured metadata", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-stage05-plan-tools-"));
    try {
      const manager = new HumanInteractionManager();
      manager.onRequest((request) => {
        if (request.type === "plan_approval") {
          manager.resolvePlanApproval(request.id, true);
        }
      });
      const events: UiEvent[] = [];
      const store = new PlanStore({ cwd: dir });
      let profile: AgentProfileName = "build";
      const tools = createPlanTools({
        store,
        humanInteractionManager: manager,
        getProfile: () => profile,
        onUiEvent(event) {
          events.push(event);
        },
      });
      const context = {
        cwd: dir,
        sessionId: "sess_tools",
        toolCallId: "tool_1",
        signal: new AbortController().signal,
        emit() {},
      };
      const enter = await tools.find((tool) => tool.name === "plan_enter")?.execute({}, context);
      expect(enter?.metadata?.plan).toMatchObject({ status: "entered", nextProfile: "plan" });
      profile = "plan";
      const write = await tools.find((tool) => tool.name === "plan_write")?.execute({
        content: "# Plan\n\n- Do it",
      }, context);
      expect(write?.metadata?.plan).toMatchObject({ status: "updated", nextProfile: "plan" });
      const exit = await tools.find((tool) => tool.name === "plan_exit")?.execute({}, context);
      expect(exit?.metadata?.plan).toMatchObject({ status: "approved", nextProfile: "build" });
      expect(events.some((event) => event.type === "plan_approval_request")).toBe(true);

      const emptyStore = new PlanStore({ cwd: path.join(dir, "empty") });
      const emptyExit = await createPlanTools({ store: emptyStore }).find((tool) => tool.name === "plan_exit")?.execute({}, {
        ...context,
        sessionId: "empty",
      });
      expect(emptyExit?.ok).toBe(false);
      expect(emptyExit?.error?.kind).toBe("validation");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("enforces plan guard and readonly bash boundaries", async () => {
    expect(isReadonlyBashCommand("rg stage-05 src")).toBe(true);
    expect(isReadonlyBashCommand("git diff -- src")).toBe(true);
    expect(isReadonlyBashCommand("rm -rf src")).toBe(false);
    expect(isReadonlyBashCommand("echo hi > file")).toBe(false);

    let profile: AgentProfileName = "plan";
    const guard = createPlanGuardMiddleware({ getProfile: () => profile });
    const base = {
      sessionId: "sess",
      cwd: process.cwd(),
      signal: new AbortController().signal,
    };
    expect(await guard.beforeToolUse?.({
      ...base,
      toolUse: { id: "read_1", name: "read_file", input: { path: "package.json" } },
    })).toBeUndefined();
    expect(await guard.beforeToolUse?.({
      ...base,
      toolUse: { id: "grep_1", name: "grep", input: { pattern: "stage-05", path: "src" } },
    })).toBeUndefined();
    expect(await guard.beforeToolUse?.({
      ...base,
      toolUse: { id: "glob_1", name: "glob", input: { pattern: "**/*.ts" } },
    })).toBeUndefined();
    expect(await guard.beforeToolUse?.({
      ...base,
      toolUse: { id: "bash_1", name: "bash", input: { command: "pwd" } },
    })).toBeUndefined();
    expect(await guard.beforeToolUse?.({
      ...base,
      toolUse: { id: "write_1", name: "write_file", input: { path: "x", content: "x" } },
    })).toMatchObject({ ok: false, error: { kind: "permission" } });
    expect(await guard.beforeToolUse?.({
      ...base,
      toolUse: { id: "patch_1", name: "apply_patch", input: { patch: "*** Begin Patch\n*** End Patch" } },
    })).toMatchObject({ ok: false, error: { kind: "permission" } });
    expect(await guard.beforeToolUse?.({
      ...base,
      toolUse: { id: "bash_2", name: "bash", input: { command: "touch x" } },
    })).toMatchObject({ ok: false, error: { kind: "permission" } });
    profile = "build";
    expect(await guard.beforeToolUse?.({
      ...base,
      toolUse: { id: "write_2", name: "write_file", input: { path: "x", content: "x" } },
    })).toBeUndefined();
  });

  it("handles plan approval requests through HumanInteractionManager", async () => {
    const manager = new HumanInteractionManager();
    const controller = new AbortController();
    let requestId = "";
    manager.onRequest((request) => {
      if (request.type === "plan_approval") {
        requestId = request.id;
        expect(request.planPath).toBe("/tmp/plan.md");
      }
    });
    const approval = manager.requestPlanApproval({
      sessionId: "sess",
      planPath: "/tmp/plan.md",
      planBody: "# Plan",
      profile: "plan",
    }, controller.signal);
    expect(manager.pendingCount()).toBe(1);
    manager.resolvePlanApproval(requestId, false);
    await expect(approval).resolves.toBe(false);
    expect(manager.pendingCount()).toBe(0);

    const aborted = manager.requestPlanApproval({
      sessionId: "sess",
      planPath: "/tmp/plan.md",
      planBody: "# Plan",
      profile: "plan",
    }, controller.signal);
    controller.abort();
    await expect(aborted).rejects.toThrow("Operation was aborted");
  });
});

describe("stage-05 run loop, command input, and session projection", () => {
  it("switches profile after plan_enter, writes a plan, exits with approval, and emits plan events", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-stage05-loop-"));
    try {
      const manager = new HumanInteractionManager();
      manager.onRequest((request) => {
        if (request.type === "plan_approval") {
          manager.resolvePlanApproval(request.id, true);
        }
      });
      const store = new PlanStore({ cwd: dir });
      let profile: AgentProfileName = "build";
      const uiEvents: UiEvent[] = [];
      const provider = new StagedProvider([
        [
          { type: "tool_call", toolCall: { id: "enter", name: "plan_enter", input: {} } },
          { type: "done" },
        ],
        [
          {
            type: "tool_call",
            toolCall: {
              id: "write",
              name: "plan_write",
              input: { content: "# Plan\n\n- Implement safely" },
            },
          },
          { type: "done" },
        ],
        [
          { type: "tool_call", toolCall: { id: "exit", name: "plan_exit", input: {} } },
          { type: "done" },
        ],
        [
          { type: "text_delta", text: "ready to build" },
          { type: "done" },
        ],
      ]);

      await runReactLoop({
        task: "plan",
        model: "fixture-model",
        provider,
        profileName: profile,
        getToolRegistryForProfile(profileName) {
          return createProfileToolRegistry({
            profileName,
            humanInteractionManager: manager,
            planRuntime: {
              store,
              humanInteractionManager: manager,
              getProfile: () => profile,
              onUiEvent(event) {
                uiEvents.push(event);
              },
            },
          });
        },
        middleware: [createPlanGuardMiddleware({ getProfile: () => profile })],
        onProfileChange(next) {
          profile = next;
        },
        onUiEvent(event) {
          uiEvents.push(event);
        },
      });

      expect(profile).toBe("build");
      expect(provider.inputs[0]?.tools?.map((tool) => tool.function.name)).toContain("plan_enter");
      expect(provider.inputs[1]?.tools?.map((tool) => tool.function.name)).toContain("plan_write");
      expect(provider.inputs[1]?.tools?.map((tool) => tool.function.name)).not.toContain("write_file");
      expect(uiEvents.some((event) => event.type === "plan_approval_request")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("handles /plan prompt, /plan open, picker metadata, and chat profile state", () => {
    const registry = createDefaultCommandRegistry();
    let result = applyCommandInput(createCommandInputState({ registry }), "/plan inspect", {}, { registry });
    result = applyCommandInput(result.state, "", { return: true }, { registry });
    expect(result.output).toEqual({
      type: "submit",
      submission: {
        text: "inspect",
        metadata: { slashCommand: "plan", requestedMode: "plan", requestedProfile: "plan" },
      },
    });

    result = applyCommandInput(createCommandInputState({ registry }), "/plan open", {}, { registry });
    result = applyCommandInput(result.state, "", { return: true }, { registry });
    expect(result.output).toEqual({
      type: "local_action",
      result: { type: "local_action", action: "plan_open" },
    });

    const picker = applyCommandInput(createCommandInputState({ registry }), "/", {}, { registry });
    expect(picker.state.picker.items.some((item) => item.name === "plan")).toBe(true);
  });

  bunIt("records plan facts, rebuilds approved plan context, opens plan, and replays plan approval", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-stage05-cli-"));
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
        path.join(process.cwd(), "fixtures/plan-exit-approved.json"),
        "plan then build",
      ], {
        cwd: dir,
        stdout: stdout.stream,
        stderr: stderr.stream,
        sessionDbPath: dbPath,
      });
      expect(stdout.output()).toBe("Plan approved and build handoff is ready.\n");
      const sessionId = /Session: (\S+)/.exec(stderr.output())?.[1];
      expect(sessionId).toBeTruthy();

      const planOut = createWritableCollector();
      await main(["plan", "open", "--session", sessionId!], {
        cwd: dir,
        stdout: planOut.stream,
        sessionDbPath: dbPath,
      });
      expect(planOut.output()).toContain("Plan:");
      expect(planOut.output()).toContain("Run stage-05 validation");

      const replayOut = createWritableCollector();
      await main(["sessions", "replay", sessionId!], {
        cwd: dir,
        stdout: replayOut.stream,
        sessionDbPath: dbPath,
      });
      expect(replayOut.output()).toContain("plan approved");
      expect(replayOut.output()).not.toContain("hidden");

      const store = await import("../src/session/sqlite-store.js").then((module) => module.openSqliteSessionStore(dbPath));
      try {
        const loaded = store.loadSession(sessionId!);
        const rebuilt = rebuildProviderMessages(loaded!);
        expect(rebuilt[0]).toMatchObject({ role: "system" });
        expect(rebuilt[0]?.content).toContain("Approved implementation plan");
      } finally {
        store.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
