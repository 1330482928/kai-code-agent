import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyPatchPlan,
  createDefaultToolRegistry,
  createPlanGuardMiddleware,
  createProfileToolRegistry,
  formatToolResultForModel,
  globMatcher,
  main,
  parsePatch,
  PatchApplyError,
  PatchParseError,
  PlanStore,
  runTool,
  summarizeToolUse,
  type AgentProfileName,
  type ExecutableToolUse,
} from "../src/index.js";

const tempDirs: string[] = [];
const hasBun = "Bun" in globalThis;
const bunIt = hasBun ? it : it.skip;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("stage-07 grep, glob, and apply_patch", () => {
  it("parses structured patches with add, delete, update, and move hunks", () => {
    const plan = parsePatch([
      "*** Begin Patch",
      "*** Add File: notes/new.txt",
      "+hello",
      "*** Delete File: notes/old.txt",
      "*** Update File: src/old.ts",
      "*** Move to: src/new.ts",
      "@@",
      "-const value = 1;",
      "+const value = 2;",
      "*** End Patch",
    ].join("\n"));

    expect(plan.changes.map((change) => change.type)).toEqual(["add", "delete", "update"]);
    expect(plan.changes[2]).toMatchObject({
      type: "update",
      path: "src/old.ts",
      moveTo: "src/new.ts",
    });
    expect(() => parsePatch("not a patch")).toThrow(PatchParseError);
    expect(() => parsePatch([
      "*** Begin Patch",
      "*** Update File: src/bad.ts",
      "+missing hunk header",
      "*** End Patch",
    ].join("\n"))).toThrow(PatchParseError);
  });

  it("applies multi-file patches atomically inside the workspace", async () => {
    const cwd = await tempDir();
    await writeFile(path.join(cwd, "update.txt"), "alpha\nbeta   \ngamma\n", "utf8");
    await writeFile(path.join(cwd, "delete.txt"), "remove me\n", "utf8");
    await writeFile(path.join(cwd, "move.txt"), "old name\n", "utf8");

    const result = await applyPatchPlan(cwd, parsePatch([
      "*** Begin Patch",
      "*** Add File: created.txt",
      "+created",
      "*** Delete File: delete.txt",
      "*** Update File: update.txt",
      "@@",
      " alpha",
      "-beta",
      "+BETA",
      " gamma",
      "*** Update File: move.txt",
      "*** Move to: moved.txt",
      "@@",
      "-old name",
      "+new name",
      "*** End Patch",
    ].join("\n")));

    expect(result.counts).toEqual({ add: 1, delete: 1, update: 2, move: 1 });
    expect(await readFile(path.join(cwd, "created.txt"), "utf8")).toBe("created\n");
    expect(await readFile(path.join(cwd, "update.txt"), "utf8")).toBe("alpha\nBETA\ngamma\n");
    await expect(readFile(path.join(cwd, "delete.txt"), "utf8")).rejects.toThrow();
    expect(await readFile(path.join(cwd, "moved.txt"), "utf8")).toBe("new name\n");
  });

  it("rejects failed patches without partially writing earlier staged changes", async () => {
    const cwd = await tempDir();
    await writeFile(path.join(cwd, "a.txt"), "alpha\n", "utf8");
    await writeFile(path.join(cwd, "b.txt"), "beta\n", "utf8");

    await expect(applyPatchPlan(cwd, parsePatch([
      "*** Begin Patch",
      "*** Update File: a.txt",
      "@@",
      "-alpha",
      "+changed",
      "*** Update File: b.txt",
      "@@",
      "-missing",
      "+changed",
      "*** End Patch",
    ].join("\n")))).rejects.toThrow(PatchApplyError);

    expect(await readFile(path.join(cwd, "a.txt"), "utf8")).toBe("alpha\n");
    expect(await readFile(path.join(cwd, "b.txt"), "utf8")).toBe("beta\n");
    await expect(applyPatchPlan(cwd, parsePatch([
      "*** Begin Patch",
      "*** Add File: ../outside.txt",
      "+nope",
      "*** End Patch",
    ].join("\n")))).rejects.toMatchObject({ kind: "permission" });
  });

  it("runs grep with bounded matches and safe error handling", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "src"), { recursive: true });
    await writeFile(path.join(cwd, "src/a.txt"), "one MARKER\n", "utf8");
    await writeFile(path.join(cwd, "src/b.txt"), "two MARKER\n", "utf8");
    const registry = createDefaultToolRegistry();

    const found = await runTool(
      registry,
      toolUse("grep", { pattern: "MARKER", path: "src", fixedStrings: true, limit: 1 }),
      context(cwd),
    );
    expect(found.ok).toBe(true);
    expect(found.metadata?.grep).toMatchObject({ returned: 1, truncated: true });
    expect(formatToolResultForModel("grep", found)).toContain("\"matches\"");

    const none = await runTool(
      registry,
      toolUse("grep", { pattern: "NOT_PRESENT", path: "src", fixedStrings: true }),
      context(cwd),
    );
    expect(none.ok).toBe(true);
    expect(none.metadata?.grep).toMatchObject({ returned: 0, truncated: false });
    expect(none.output).toContain("No matches");

    const escaped = await runTool(registry, toolUse("grep", { pattern: "MARKER", path: "../outside" }), context(cwd));
    expect(escaped.ok).toBe(false);
    expect(escaped.error?.kind).toBe("permission");

    const invalidPattern = await runTool(registry, toolUse("grep", { pattern: "[" }), context(cwd));
    expect(invalidPattern.ok).toBe(false);
    expect(invalidPattern.error?.kind).toBe("validation");

    const missingRg = await runTool(
      registry,
      toolUse("grep", { pattern: "MARKER", path: "src", rgPath: "kai-missing-rg-for-test" }),
      context(cwd),
    );
    expect(missingRg.ok).toBe(false);
    expect(missingRg.error?.kind).toBe("execution");
  });

  it("runs glob through ripgrep file listing with bounded results", async () => {
    const cwd = await tempDir();
    await mkdir(path.join(cwd, "src/nested"), { recursive: true });
    await writeFile(path.join(cwd, "src/a.ts"), "", "utf8");
    await writeFile(path.join(cwd, "src/nested/b.ts"), "", "utf8");
    await writeFile(path.join(cwd, "README.md"), "", "utf8");
    const registry = createDefaultToolRegistry();

    expect(globMatcher("**/*.ts")("src/nested/b.ts")).toBe(true);
    expect(globMatcher("*.md")("README.md")).toBe(true);

    const listedAll = await runTool(registry, toolUse("glob", { pattern: "**/*.ts", limit: 10 }), context(cwd));
    expect(listedAll.ok).toBe(true);
    expect((listedAll.metadata?.glob as { files?: string[] } | undefined)?.files).toEqual([
      "./src/a.ts",
      "./src/nested/b.ts",
    ]);

    const listed = await runTool(registry, toolUse("glob", { pattern: "**/*.ts", limit: 1 }), context(cwd));
    expect(listed.ok).toBe(true);
    expect(listed.metadata?.glob).toMatchObject({ returned: 1, truncated: true });
    expect(formatToolResultForModel("glob", listed)).toContain("\"files\"");

    const none = await runTool(registry, toolUse("glob", { pattern: "**/*.tsx" }), context(cwd));
    expect(none.ok).toBe(true);
    expect(none.metadata?.glob).toMatchObject({ returned: 0, truncated: false });
    expect(none.output).toContain("No files match");

    const escaped = await runTool(registry, toolUse("glob", { pattern: "../*.ts" }), context(cwd));
    expect(escaped.ok).toBe(false);
    expect(escaped.error?.kind).toBe("permission");

    const missingRg = await runTool(
      registry,
      toolUse("glob", { pattern: "**/*.ts", rgPath: "kai-missing-rg-for-test" }),
      context(cwd),
    );
    expect(missingRg.ok).toBe(false);
    expect(missingRg.error?.kind).toBe("execution");
  });

  it("runs apply_patch as a tool and returns bounded model-visible metadata", async () => {
    const cwd = await tempDir();
    const registry = createDefaultToolRegistry();
    const result = await runTool(
      registry,
      toolUse("apply_patch", {
        patch: [
          "*** Begin Patch",
          "*** Add File: nested/tool.txt",
          "+created by tool",
          "*** End Patch",
        ].join("\n"),
      }),
      context(cwd),
    );

    expect(result.ok).toBe(true);
    expect(await readFile(path.join(cwd, "nested/tool.txt"), "utf8")).toBe("created by tool\n");
    const formatted = JSON.parse(formatToolResultForModel("apply_patch", result)) as { counts: { add: number } };
    expect(formatted.counts.add).toBe(1);
    expect(summarizeToolUse(toolUse("apply_patch", { patch: "*** Begin Patch\n*** Add File: x.txt\n+x\n*** End Patch" }))).toMatchObject({
      title: "Apply patch",
      detail: "x.txt",
    });

    const failed = await runTool(
      registry,
      toolUse("apply_patch", {
        patch: [
          "*** Begin Patch",
          "*** Add File: nested/tool.txt",
          "+conflict",
          "*** End Patch",
        ].join("\n"),
      }),
      context(cwd),
    );
    expect(failed.ok).toBe(false);
    expect(failed.error?.kind).toBe("validation");
    expect(JSON.parse(formatToolResultForModel("apply_patch", failed))).toMatchObject({
      ok: false,
      error: { kind: "validation" },
    });
  });

  it("exposes grep/glob to plan mode and apply_patch only to build mode", async () => {
    const cwd = await tempDir();
    const store = new PlanStore({ cwd });
    let profile: AgentProfileName = "build";

    const buildRegistry = createProfileToolRegistry({
      profileName: "build",
      planRuntime: { store, getProfile: () => profile },
    });
    expect(buildRegistry.providerSchemas().map((schema) => schema.function.name)).toEqual([
      "read_file",
      "write_file",
      "edit_file",
      "grep",
      "glob",
      "apply_patch",
      "bash",
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
      "ask_user_question",
      "plan_enter",
      "plan_write",
      "plan_exit",
    ]);

    const guard = createPlanGuardMiddleware({ getProfile: () => "plan" });
    expect(await guard.beforeToolUse?.({
      cwd,
      sessionId: "session",
      signal: new AbortController().signal,
      toolUse: toolUse("apply_patch", { patch: "*** Begin Patch\n*** End Patch" }),
    })).toMatchObject({ ok: false, error: { kind: "permission" } });
  });

  it("runs Stage 07 fixture CLI paths", async () => {
    const cwd = await tempDir();
    await writeFile(path.join(cwd, "marker.txt"), "STAGE07_MARKER\n", "utf8");
    await writeFile(path.join(cwd, "sample.ts"), "export const value = 1;\n", "utf8");
    const grepOut = createWritableCollector();
    const globOut = createWritableCollector();
    const patchOut = createWritableCollector();
    const failedPatchOut = createWritableCollector();

    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/grep.json"),
      "grep marker",
    ], { cwd, stdout: grepOut.stream });
    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/glob.json"),
      "glob files",
    ], { cwd, stdout: globOut.stream });
    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/apply-patch.json"),
      "apply patch",
    ], { cwd, stdout: patchOut.stream });
    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/apply-patch-failure.json"),
      "apply patch failure",
    ], { cwd, stdout: failedPatchOut.stream });

    expect(grepOut.output()).toBe("Searched for the Stage 07 marker.\n");
    expect(globOut.output()).toBe("Listed TypeScript files through the glob tool.\n");
    expect(patchOut.output()).toBe("Applied the Stage 07 fixture patch.\n");
    expect(failedPatchOut.output()).toBe("Patch failed safely.\n");
    expect(await readFile(path.join(cwd, "stage07-fixture.txt"), "utf8")).toBe("created by apply_patch fixture\n");
  });

  bunIt("records bounded Stage 07 tool results in a session-backed fixture run", async () => {
    const cwd = await tempDir();
    const stdout = createWritableCollector();
    const stderr = createWritableCollector();
    const dbPath = path.join(cwd, "sessions.sqlite");

    await main([
      "run",
      "--provider",
      "fixture",
      "--script",
      path.join(process.cwd(), "fixtures/provider/apply-patch.json"),
      "--session",
      "new",
      "apply patch",
    ], { cwd, stdout: stdout.stream, stderr: stderr.stream, sessionDbPath: dbPath });

    expect(stdout.output()).toBe("Applied the Stage 07 fixture patch.\n");
    expect(stderr.output()).toContain("Session:");
    expect(await readFile(path.join(cwd, "stage07-fixture.txt"), "utf8")).toBe("created by apply_patch fixture\n");
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-stage07-test-"));
  tempDirs.push(dir);
  return dir;
}

function toolUse(name: string, input: Record<string, unknown>): ExecutableToolUse {
  return { id: `call_${name}`, name, input: input as ExecutableToolUse["input"] };
}

function context(cwd: string) {
  return {
    cwd,
    signal: new AbortController().signal,
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
