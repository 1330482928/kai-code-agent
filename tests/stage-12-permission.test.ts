import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HumanInteractionManager } from "../src/agent/human-interaction-manager.js";
import { loadSettingsLayers } from "../src/config/settings.js";
import { openSqliteSessionStore } from "../src/session/sqlite-store.js";
import {
  classifyAction,
  createPermissionEngine,
  createPermissionMiddleware,
  rememberKeyFor,
  type PermissionSettings,
} from "../src/permissions/index.js";

const tempDirs: string[] = [];
const hasBun = "Bun" in globalThis;
const bunIt = hasBun ? it : it.skip;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("stage-12 permission engine", () => {
  it("routes read, write, bash, mcp, sub-agent, and plan decisions deterministically", async () => {
    const cwdA = await tempDir();
    const cwdB = await tempDir();

    const rememberedAction = classifyAction("bash", { command: "touch file.txt" }, "build", cwdA);
    const rememberedKey = rememberKeyFor(rememberedAction);
    const rememberedSettings: PermissionSettings = {
      permissions: {
        rememberedApprovals: {
          [rememberedKey]: {
            reason: "approved once",
            createdAt: "2026-05-14T00:00:00.000Z",
          },
        },
      },
    };

    const readOnly = createPermissionEngine({
      cwd: cwdA,
      sessionId: "sess",
      agentProfile: "build",
      permissionProfile: { name: "readOnly", rememberApprovals: false },
    });
    expect(readOnly.evaluate({ toolName: "read_file", input: { path: "README.md" } })).toMatchObject({ type: "auto" });
    expect(readOnly.evaluate({ toolName: "write_file", input: { path: "x.txt", content: "x" } })).toMatchObject({ type: "reject" });
    expect(readOnly.evaluate({ toolName: "apply_patch", input: { patch: "*** Begin Patch\n*** End Patch" } })).toMatchObject({ type: "reject" });
    expect(readOnly.evaluate({ toolName: "bash", input: { command: "touch x" } })).toMatchObject({ type: "reject" });
    expect(readOnly.evaluate({ toolName: "mcp__shell__run", input: { command: "echo hi" } })).toMatchObject({ type: "reject" });
    expect(readOnly.evaluate({ toolName: "sub_agent", input: { agent: "explorer" } })).toMatchObject({ type: "reject" });

    const workspaceWrite = createPermissionEngine({
      cwd: cwdA,
      sessionId: "sess",
      agentProfile: "build",
      permissionProfile: { name: "workspaceWrite", rememberApprovals: true },
      settings: rememberedSettings,
    });
    expect(workspaceWrite.evaluate({ toolName: "read_file", input: { path: "README.md" } })).toMatchObject({ type: "auto" });
    expect(workspaceWrite.evaluate({ toolName: "write_file", input: { path: "x.txt", content: "x" } })).toMatchObject({ type: "auto" });
    expect(workspaceWrite.evaluate({ toolName: "bash", input: { command: "pwd" } })).toMatchObject({ type: "auto" });
    expect(workspaceWrite.evaluate({ toolName: "bash", input: { command: "touch x" } })).toMatchObject({ type: "ask" });
    expect(workspaceWrite.evaluate({ toolName: "mcp__shell__run", input: { command: "echo hi" } })).toMatchObject({ type: "ask" });
    expect(workspaceWrite.evaluate({ toolName: "sub_agent", input: { agent: "explorer" } })).toMatchObject({ type: "ask" });

    const rejectOverridesRemembered = createPermissionEngine({
      cwd: cwdA,
      sessionId: "sess",
      agentProfile: "build",
      permissionProfile: { name: "workspaceWrite", rememberApprovals: true },
      settings: {
        ...rememberedSettings,
        mcpServers: {
          shell: { approval: "reject" },
        },
      },
    });
    expect(rejectOverridesRemembered.evaluate({ toolName: "mcp__shell__run", input: { command: "echo hi" } })).toMatchObject({ type: "reject" });

    const workspaceWriteOtherCwd = createPermissionEngine({
      cwd: cwdB,
      sessionId: "sess",
      agentProfile: "build",
      permissionProfile: { name: "workspaceWrite", rememberApprovals: true },
      settings: rememberedSettings,
    });
    expect(workspaceWriteOtherCwd.evaluate({ toolName: "bash", input: { command: "touch file.txt" } })).toMatchObject({ type: "ask" });

    const danger = createPermissionEngine({
      cwd: cwdA,
      sessionId: "sess",
      agentProfile: "build",
      permissionProfile: { name: "dangerFullAccess", rememberApprovals: true },
    });
    expect(danger.evaluate({ toolName: "write_file", input: { path: "x.txt", content: "x" } })).toMatchObject({ type: "auto" });
    expect(danger.evaluate({ toolName: "bash", input: { command: "touch x" } })).toMatchObject({ type: "auto" });

    const plan = createPermissionEngine({
      cwd: cwdA,
      sessionId: "sess",
      agentProfile: "plan",
      permissionProfile: { name: "readOnly", rememberApprovals: false },
      settings: rememberedSettings,
    });
    expect(plan.evaluate({ toolName: "read_file", input: { path: "README.md" } })).toMatchObject({ type: "auto" });
    expect(plan.evaluate({ toolName: "bash", input: { command: "pwd" } })).toMatchObject({ type: "auto" });
    expect(plan.evaluate({ toolName: "write_file", input: { path: "x.txt", content: "x" } })).toMatchObject({ type: "reject" });
    expect(plan.evaluate({ toolName: "mcp__shell__run", input: { command: "echo hi" } })).toMatchObject({ type: "reject" });
    expect(plan.evaluate({ toolName: "sub_agent", input: { agent: "explorer" } })).toMatchObject({ type: "reject" });
    expect(plan.evaluate({ toolName: "bash", input: { command: "touch x" } })).toMatchObject({ type: "reject" });
  });

  it("loads layered settings and keeps remembered approvals scoped by cwd", async () => {
    const cwd = await tempDir();
    const homeDir = await tempDir();

    await writeJson(path.join(homeDir, ".kai-code-agent", "settings.json"), {
      defaultPermissionProfile: "readOnly",
      permissions: {
        allow: ["user-tool"],
        deny: ["user-no"],
      },
    });
    await writeJson(path.join(cwd, ".kai", "settings.json"), {
      defaultPermissionProfile: "workspaceWrite",
      permissions: {
        allow: ["project-tool"],
      },
      tools: {
        bash: {
          allowCommands: ["git status"],
        },
      },
    });
    await writeJson(path.join(cwd, ".kai", "settings.local.json"), {
      permissions: {
        deny: ["local-no"],
      },
    });

    const loaded = await loadSettingsLayers({ cwd, homeDir });
    expect(loaded.layers.map((layer) => layer.scope)).toEqual(["user", "project", "projectLocal"]);
    expect(loaded.settings).toMatchObject({
      defaultPermissionProfile: "workspaceWrite",
      permissions: {
        allow: ["user-tool", "project-tool"],
        deny: ["user-no", "local-no"],
      },
      tools: {
        bash: {
          allowCommands: ["git status"],
        },
      },
    });

    const settings: PermissionSettings = {
      permissions: {
        rememberedApprovals: {
          [rememberKeyFor(classifyAction("bash", { command: "touch x" }, "build", cwd))]: {
            reason: "approved once",
            createdAt: "2026-05-14T00:00:00.000Z",
          },
        },
      },
    };
    const engine = createPermissionEngine({
      cwd,
      sessionId: "sess",
      agentProfile: "build",
      permissionProfile: { name: "workspaceWrite", rememberApprovals: true },
      settings,
    });
    expect(engine.evaluate({ toolName: "bash", input: { command: "touch x" } })).toMatchObject({ type: "auto" });

    const otherEngine = createPermissionEngine({
      cwd: path.join(cwd, "different"),
      sessionId: "sess",
      agentProfile: "build",
      permissionProfile: { name: "workspaceWrite", rememberApprovals: true },
      settings,
    });
    expect(otherEngine.evaluate({ toolName: "bash", input: { command: "touch x" } })).toMatchObject({ type: "ask" });
  });
});

describe("stage-12 permission middleware", () => {
  bunIt("audits approvals and persists remembered approvals into the configured scope", async () => {
    const cwd = await tempDir();
    const homeDir = await tempDir();
    const sessionDb = path.join(cwd, "sessions.sqlite");
    await writeJson(path.join(cwd, ".kai", "settings.json"), {
      permissions: {
        rememberScope: "projectLocal",
      },
    });

    const store = await openSqliteSessionStore(sessionDb);
    const session = store.createSession({ cwd });
    const recorder = store.createRecorder(session.id);
    const manager = new HumanInteractionManager();
    manager.onRequest((request) => {
      if (request.type === "approval") {
        manager.resolveApproval(request.id, true);
      }
    });

    const middleware = createPermissionMiddleware({
      cwd,
      homeDir,
      sessionId: session.id,
      agentProfile: "build",
      permissionProfile: "workspaceWrite",
      manager,
      sessionRecorder: recorder,
    });

    const result = await middleware.beforeToolUse?.({
      cwd,
      sessionId: session.id,
      signal: new AbortController().signal,
      toolUse: {
        id: "tool-1",
        name: "bash",
        input: { command: "touch remember-me.txt" },
      },
    });
    expect(result).toBeUndefined();

    const settingsPath = path.join(cwd, ".kai", "settings.local.json");
    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as PermissionSettings;
    expect(persisted.permissions?.rememberedApprovals).toBeTruthy();
    expect(Object.keys(persisted.permissions?.rememberedApprovals ?? {})).toHaveLength(1);

    const transcript = store.loadSession(session.id);
    expect(transcript?.messages.some((message) =>
      message.metadata.kind === "permission_audit"
      && message.metadata.decision === "ask"
      && message.metadata.rememberScope === "projectLocal",
    )).toBe(true);

    store.close();
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-stage12-"));
  tempDirs.push(dir);
  return dir;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
