import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDefaultToolRegistry,
  runTool,
  ToolRegistry,
  type ExecutableToolUse,
  type ToolDef,
} from "../src/index.js";
import { z } from "zod";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("coding tools", () => {
  it("lists built-in tools and provider schemas", () => {
    const registry = createDefaultToolRegistry();

    expect(registry.list().map((tool) => tool.name)).toEqual([
      "read_file",
      "write_file",
      "edit_file",
      "grep",
      "glob",
      "apply_patch",
      "bash",
      "bash_status",
      "ask_user_question",
    ]);
    expect(registry.providerSchemas().map((tool) => tool.function.name)).toEqual([
      "read_file",
      "write_file",
      "edit_file",
      "grep",
      "glob",
      "apply_patch",
      "bash",
      "bash_status",
      "ask_user_question",
    ]);
  });

  it("normalizes validation, unknown tool, and execution failures", async () => {
    const cwd = await tempDir();
    const registry = createDefaultToolRegistry();

    const invalid = await runTool(registry, toolUse("read_file", { path: "" }), context(cwd));
    expect(invalid.ok).toBe(false);
    expect(invalid.error?.kind).toBe("validation");

    const unknown = await runTool(registry, toolUse("missing_tool", {}), context(cwd));
    expect(unknown.ok).toBe(false);
    expect(unknown.error?.kind).toBe("not_found");

    const throwingTool: ToolDef = {
      name: "throwing_tool",
      description: "throws",
      inputSchema: z.object({}),
      parameters: { type: "object", properties: {}, required: [] },
      async execute() {
        throw new Error("boom");
      },
    };
    const throwingRegistry = new ToolRegistry([throwingTool]);
    const thrown = await runTool(throwingRegistry, toolUse("throwing_tool", {}), context(cwd));
    expect(thrown.ok).toBe(false);
    expect(thrown.error?.kind).toBe("execution");
  });

  it("reads, writes, and edits files inside cwd", async () => {
    const cwd = await tempDir();
    const registry = createDefaultToolRegistry();

    const written = await runTool(
      registry,
      toolUse("write_file", { path: "nested/file.txt", content: "alpha beta alpha" }),
      context(cwd),
    );
    expect(written.ok).toBe(true);
    expect(await readFile(path.join(cwd, "nested/file.txt"), "utf8")).toBe("alpha beta alpha");

    const read = await runTool(registry, toolUse("read_file", { path: "nested/file.txt" }), context(cwd));
    expect(read.ok).toBe(true);
    expect(read.output).toBe("alpha beta alpha");

    const duplicate = await runTool(
      registry,
      toolUse("edit_file", { path: "nested/file.txt", oldString: "alpha", newString: "gamma" }),
      context(cwd),
    );
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error?.kind).toBe("validation");

    const edited = await runTool(
      registry,
      toolUse("edit_file", { path: "nested/file.txt", oldString: "alpha", newString: "gamma", replaceAll: true }),
      context(cwd),
    );
    expect(edited.ok).toBe(true);
    expect(edited.metadata?.replacements).toBe(2);
    expect(await readFile(path.join(cwd, "nested/file.txt"), "utf8")).toBe("gamma beta gamma");
  });

  it("rejects file paths outside cwd", async () => {
    const cwd = await tempDir();
    const registry = createDefaultToolRegistry();

    const result = await runTool(registry, toolUse("read_file", { path: "../outside.txt" }), context(cwd));

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("permission");
  });

  it("runs bash commands with metadata", async () => {
    const cwd = await tempDir();
    const registry = createDefaultToolRegistry();

    const ok = await runTool(registry, toolUse("bash", { command: "printf hello" }), context(cwd));
    expect(ok.ok).toBe(true);
    expect(ok.metadata?.bash).toMatchObject({
      stdoutPreview: "hello",
      exitCode: 0,
      interrupted: false,
    });

    const failed = await runTool(registry, toolUse("bash", { command: "exit 7" }), context(cwd));
    expect(failed.ok).toBe(true);
    expect(failed.metadata?.bash).toMatchObject({ exitCode: 7 });

    const timedOut = await runTool(registry, toolUse("bash", { command: "sleep 1", timeout: 50 }), context(cwd));
    expect(timedOut.ok).toBe(false);
    expect(timedOut.error?.kind).toBe("timeout");
    expect(timedOut.metadata?.bash).toMatchObject({ interrupted: true, exitCode: null });

    const large = await runTool(
      registry,
      toolUse("bash", { command: "printf '%07000d' 0" }),
      context(cwd),
    );
    const bash = large.metadata?.bash as { stdoutPreview?: string; outputBytes?: number } | undefined;
    expect(large.ok).toBe(true);
    expect(bash?.stdoutPreview).toContain("[truncated");
    expect(bash?.outputBytes).toBeGreaterThan(6000);
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-tools-test-"));
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
