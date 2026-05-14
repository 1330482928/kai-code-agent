import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildSubAgentContextItems,
  createProfileToolRegistry,
  createSubAgentTool,
  createSubAgentToolMailbox,
  discoverAgents,
  formatAgentCatalogList,
  FixtureProvider,
  main,
  runReactLoop,
} from "../src/index.js";

const tempDirs: string[] = [];
const hasBun = "Bun" in globalThis;
const bunIt = hasBun ? it : it.skip;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("stage-11 agent discovery", () => {
  it("discovers markdown agent definitions and keeps prompt bodies out of the list output", async () => {
    const cwd = await tempDir();
    await writeAgent(path.join(cwd, ".kai", "agents", "explorer.md"), [
      "---",
      "name: explorer",
      "description: Explore the codebase safely",
      "tools:",
      "  - read_file",
      "  - grep",
      "skills:",
      "  - typescript",
      "maxTurns: 3",
      "---",
      "FULL AGENT PROMPT SECRET",
    ].join("\n"));

    const catalog = await discoverAgents({ cwd });
    expect(catalog.selected).toHaveLength(1);
    expect(catalog.selected[0]).toMatchObject({
      name: "explorer",
      description: "Explore the codebase safely",
      tools: ["read_file", "grep"],
      skills: ["typescript"],
      maxTurns: 3,
    });
    expect(formatAgentCatalogList(catalog)).toContain("explorer");
    expect(formatAgentCatalogList(catalog)).not.toContain("FULL AGENT PROMPT SECRET");

    const stdout = createWritableCollector();
    await main(["agents", "list"], {
      cwd,
      stdout: stdout.stream,
    });
    expect(stdout.output()).toContain("explorer");
    expect(stdout.output()).toContain("read_file, grep");
    expect(stdout.output()).not.toContain("FULL AGENT PROMPT SECRET");
  });
});

describe("stage-11 sub-agent orchestration", () => {
  bunIt("runs a child agent in isolation, persists a side transcript, and injects a subagent ContextItem", async () => {
    const cwd = await tempDir();
    const sideTranscriptDb = path.join(cwd, "agent-runs.sqlite");
    await writeAgent(path.join(cwd, ".kai", "agents", "explorer.md"), [
      "---",
      "name: explorer",
      "description: Inspect the codebase",
      "tools:",
      "  - read_file",
      "---",
      "You are an explorer agent.",
    ].join("\n"));

    const provider = new FixtureProvider([
      [
        {
          type: "tool_call",
          toolCall: {
            id: "parent-tool",
            name: "sub_agent",
            input: {
              agent: "explorer",
              task: "inspect the target",
            },
          },
        },
        { type: "done" },
      ],
      [
        {
          type: "text_delta",
          text: JSON.stringify({
            summary: "Found the target path",
            changedFiles: ["src/target.ts"],
            openQuestions: ["Should this split into a worker?"],
          }),
        },
        { type: "done" },
      ],
      [
        { type: "text_delta", text: "Parent completed." },
        { type: "done" },
      ],
    ]);

    const mailbox = createSubAgentToolMailbox();
    const subAgentTool = createSubAgentTool({
      provider,
      model: "fixture-model",
      cwd,
      sessionId: "parent-session",
      sessionDbPath: sideTranscriptDb,
      mailbox,
    });
    const registry = createProfileToolRegistry({
      profileName: "build",
      subAgentTool,
    });

    await runReactLoop({
      task: "delegate the inspection",
      model: "fixture-model",
      provider,
      cwd,
      sessionId: "parent-session",
      toolRegistry: registry,
      getToolRegistryForProfile: () => registry,
      middleware: [
        {
          name: "subagent",
          contextItems() {
            return buildSubAgentContextItems(mailbox);
          },
        },
      ],
      contextOptions: {
        includeBase: false,
        includeInstructions: false,
        includeRuntime: false,
      },
    });

    expect(provider.inputs).toHaveLength(3);
    expect(provider.inputs[1]?.tools?.map((tool) => tool.function.name)).toEqual(["read_file"]);
    expect(provider.inputs[2]?.messages.some((message) =>
      message.role === "system" && message.content.includes("Sub-agent explorer result"),
    )).toBe(true);
    expect(provider.inputs[2]?.messages.some((message) =>
      message.role === "system" && message.content.includes("Found the target path"),
    )).toBe(true);
    expect(mailbox.list()).toHaveLength(1);
    expect(mailbox.list()[0]).toMatchObject({
      agentName: "explorer",
      summary: "Found the target path",
      changedFiles: ["src/target.ts"],
      openQuestions: ["Should this split into a worker?"],
    });

    const stats = await stat(sideTranscriptDb);
    expect(stats.isFile()).toBe(true);
  });
});

async function writeAgent(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${content}\n`);
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-stage11-"));
  tempDirs.push(dir);
  return dir;
}

function createWritableCollector(): {
  stream: Writable;
  output(): string;
} {
  let output = "";
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    }),
    output() {
      return output;
    },
  };
}
