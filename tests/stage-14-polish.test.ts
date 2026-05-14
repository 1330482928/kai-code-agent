import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { main } from "../src/index.js";
import { bashStatusTool } from "../src/coding/tools/bash-status.js";
import { bashTool } from "../src/coding/tools/bash.js";
import { JsonBashTaskStore, getDefaultBashTaskStorePath } from "../src/coding/tools/bash-task-store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("stage-14 CLI polish", () => {
  it("writes an init template, explains settings, reports doctor checks, and shows help text", async () => {
    const cwd = await tempDir();
    const home = await tempDir();
    const configPath = path.join(home, ".kai-code-agent", "config.yaml");

    const initStdout = createWritableCollector();
    await main(["init"], {
      cwd,
      env: { HOME: home, KAI_CONFIG_PATH: configPath },
      prompt: createPrompt(["", "", "test-key", "test-model"]),
      stdout: initStdout.stream,
    });
    expect(initStdout.output()).toContain("Model config written to");
    expect(await readFile(configPath, "utf8")).toContain("defaultModel: minimax-global");

    await writeJson(path.join(home, ".kai-code-agent", "settings.json"), {
      permissionProfile: "readOnly",
    });
    await writeJson(path.join(cwd, ".kai", "settings.json"), {
      permissionProfile: "workspaceWrite",
    });
    await writeJson(path.join(cwd, ".kai", "settings.local.json"), {
      debug: true,
    });

    const settingsStdout = createWritableCollector();
    await main(["settings", "explain"], {
      cwd,
      env: { HOME: home },
      stdout: settingsStdout.stream,
    });
    expect(settingsStdout.output()).toContain("Kai settings explain");
    expect(settingsStdout.output()).toContain("user:");
    expect(settingsStdout.output()).toContain("projectLocal");
    expect(settingsStdout.output()).toContain("\"permissionProfile\": \"workspaceWrite\"");

    const doctorStdout = createWritableCollector();
    await main(["doctor"], {
      cwd,
      env: { HOME: home, KAI_CONFIG_PATH: path.join(home, ".kai-code-agent", "missing.yaml") },
      stdout: doctorStdout.stream,
    });
    expect(doctorStdout.output()).toContain("Kai doctor");
    expect(doctorStdout.output()).toContain("model config: MISSING");
    expect(doctorStdout.output()).toContain("ripgrep");

    const helpStdout = createWritableCollector();
    await main(["--help"], { cwd, stdout: helpStdout.stream });
    expect(helpStdout.output()).toContain("kai doctor");
    expect(helpStdout.output()).toContain("kai tasks list");
  });

  it("tracks background bash tasks and exposes read/status views", async () => {
    const cwd = await tempDir();
    const storePath = getDefaultBashTaskStorePath({ cwd });
    const taskContext = {
      cwd,
      signal: new AbortController().signal,
      sessionId: "sess",
      toolCallId: "tool-1",
      emit() {
        return undefined;
      },
    };

    const result = await bashTool.execute({
      command: "printf 'background task\\n'",
      run_in_background: true,
    }, taskContext);
    expect(result.ok).toBe(true);
    const bashMetadata = result.metadata?.bash as Record<string, unknown> | undefined;
    const taskId = String(bashMetadata?.backgroundTaskId ?? "");
    expect(taskId).toMatch(/^bash_/);

    await waitFor(async () => {
      const store = new JsonBashTaskStore(storePath);
      const record = await store.readOutput(taskId);
      return Boolean(record.output && record.output.length > 0);
    });

    const listStdout = createWritableCollector();
    await main(["tasks", "list"], { cwd, stdout: listStdout.stream });
    expect(listStdout.output()).toContain(taskId);
    expect(listStdout.output()).toContain("background task");

    const readStdout = createWritableCollector();
    await main(["tasks", "read", taskId], { cwd, stdout: readStdout.stream });
    expect(readStdout.output()).toContain("Task:");
    expect(readStdout.output()).toContain("background task");

    const statusResult = await bashStatusTool.execute({
      taskId,
      tailBytes: 128,
    }, taskContext);
    expect(statusResult.ok).toBe(true);
    expect(statusResult.output).toContain("background task");
  });

  it("writes opt-in debug JSONL for a normal run", async () => {
    const cwd = await tempDir();
    const scriptPath = path.join(cwd, "fixture.json");
    const debugPath = path.join(cwd, "debug.jsonl");
    await writeFile(scriptPath, JSON.stringify({
      events: [
        { type: "text_delta", text: "hello" },
        { type: "done" },
      ],
    }, null, 2));

    const stdout = createWritableCollector();
    const stderr = createWritableCollector();
    await main(
      ["run", "--provider", "fixture", "--script", scriptPath, "debug task"],
      {
        cwd,
        env: { KAI_DEBUG_JSONL: debugPath },
        stdout: stdout.stream,
        stderr: stderr.stream,
      },
    );

    const jsonl = await readFile(debugPath, "utf8");
    expect(jsonl).toContain("\"kind\":\"provider_event\"");
    expect(jsonl).toContain("\"kind\":\"turn_end\"");
    expect(stdout.output()).toContain("hello");
  });
});

function createPrompt(answers: string[]) {
  let index = 0;
  return {
    async question() {
      return answers[index++] ?? "";
    },
    close() {
      return undefined;
    },
  };
}

function createWritableCollector() {
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

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-stage14-"));
  tempDirs.push(dir);
  return dir;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for condition");
}
