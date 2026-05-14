import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyCommandInput,
  buildSkillContextItemsForRun,
  createCommandInputState,
  createDefaultCommandRegistry,
  createSkillSlashCommands,
  createSkillsMiddleware,
  discoverSkills,
  formatSkillCatalogList,
  loadSkillCatalog,
  main,
  normalizePromptTaskForSkillActivation,
  parseSkillMarkdown,
  resolveSkillActivation,
  runReactLoop,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderInput,
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("stage-10a skill discovery and catalog", () => {
  it("parses frontmatter, validates invalid metadata, and falls back to body description", () => {
    const parsed = parseSkillMarkdown({
      directoryName: "typescript",
      content: [
        "---",
        "name: TypeScript",
        "description: TypeScript refactoring guidance",
        "whenToUse: Use for TS edits",
        "allowedTools:",
        "  - read_file",
        "priority: 7",
        "---",
        "# Body",
        "Full body stays out of the catalog.",
      ].join("\n"),
    });
    expect(parsed.metadata).toMatchObject({
      name: "TypeScript",
      normalizedName: "typescript",
      description: "TypeScript refactoring guidance",
      whenToUse: "Use for TS edits",
      allowedTools: ["read_file"],
      priority: 7,
    });

    const invalid = parseSkillMarkdown({
      directoryName: "review",
      content: [
        "---",
        "priority: high",
        "allowedTools:",
        "  - 1",
        "---",
        "# Review",
        "",
        "Fallback paragraph for the catalog.",
      ].join("\n"),
    });
    expect(invalid.metadata.description).toBe("Fallback paragraph for the catalog.");
    expect(invalid.metadata.priority).toBeUndefined();
    expect(invalid.metadata.allowedTools).toBeUndefined();
    expect(invalid.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toContain("Invalid priority");
    expect(invalid.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toContain("Invalid allowedTools");
  });

  it("discovers ordered directories, resolves duplicates, and exposes shadowed entries", async () => {
    const cwd = await tempDir();
    const home = await tempDir();
    await writeSkill(path.join(cwd, "skills", "typescript"), [
      "---",
      "name: typescript",
      "---",
      "Project TypeScript.",
    ].join("\n"));
    await writeSkill(path.join(cwd, ".kai", "skills", "typescript"), [
      "---",
      "name: typescript",
      "---",
      "Lower directory TypeScript.",
    ].join("\n"));
    await writeSkill(path.join(cwd, "skills", "review"), [
      "---",
      "name: review",
      "priority: 1",
      "---",
      "Project review.",
    ].join("\n"));
    await writeSkill(path.join(home, ".kai-code-agent", "skills", "review"), [
      "---",
      "name: review",
      "priority: 10",
      "---",
      "User review wins by explicit priority.",
    ].join("\n"));

    const discovery = await discoverSkills({ cwd, homeDir: home });

    expect(discovery.selected.find((entry) => entry.name === "typescript")?.skillPath)
      .toBe(path.join(cwd, "skills", "typescript", "SKILL.md"));
    expect(discovery.selected.find((entry) => entry.name === "review")?.skillPath)
      .toBe(path.join(home, ".kai-code-agent", "skills", "review", "SKILL.md"));
    expect(discovery.shadowed.map((shadow) => shadow.reason).join("\n")).toContain("lower directory priority");
    expect(discovery.shadowed.map((shadow) => shadow.reason).join("\n")).toContain("lower priority");
  });

  it("lists selected and shadowed skills without printing full bodies", async () => {
    const cwd = await tempDir();
    await writeSkill(path.join(cwd, "skills", "typescript"), [
      "---",
      "name: typescript",
      "description: Catalog description",
      "---",
      "FULL BODY SECRET",
    ].join("\n"));
    await writeSkill(path.join(cwd, ".kai", "skills", "typescript"), [
      "---",
      "name: typescript",
      "---",
      "Shadowed body.",
    ].join("\n"));

    const catalog = await loadSkillCatalog({ cwd });
    expect(formatSkillCatalogList(catalog)).toContain("Catalog description");
    expect(formatSkillCatalogList(catalog)).not.toContain("FULL BODY SECRET");
    expect(formatSkillCatalogList(catalog, { all: true })).toContain("shadowed");

    const stdout = createWritableCollector();
    await main(["skills", "list", "--all"], { cwd, stdout: stdout.stream });
    expect(stdout.output()).toContain("typescript");
    expect(stdout.output()).toContain("shadowed");
    expect(stdout.output()).not.toContain("FULL BODY SECRET");
  });
});

describe("stage-10a explicit skill activation", () => {
  it("registers catalog-backed slash commands that submit skill metadata", async () => {
    const cwd = await tempDir();
    await writeSkill(path.join(cwd, "skills", "typescript"), [
      "---",
      "name: TypeScript",
      "description: TS help",
      "---",
      "TS body.",
    ].join("\n"));
    const catalog = await loadSkillCatalog({ cwd });
    const registry = createDefaultCommandRegistry({
      extraEntries: createSkillSlashCommands(catalog.selected),
    });

    expect(registry.entries().map((entry) => entry.name)).toContain("typescript");
    const resolved = registry.resolve("/typescript refactor this file");
    expect(resolved).toEqual({
      type: "prompt_submission",
      submission: {
        text: "refactor this file",
        metadata: {
          slashCommand: "/typescript",
          requestedSkillName: "typescript",
        },
      },
    });
    expect(registry.resolve("/missing refactor")).toEqual({ type: "input_transform", text: "/missing refactor" });

    const opened = applyCommandInput(
      createCommandInputState({ registry }),
      "/",
      {},
      { registry },
    );
    expect(opened.state.picker.open).toBe(true);
    expect(opened.state.picker.items.map((entry) => entry.name)).toContain("typescript");
  });

  it("resolves slash metadata before dollar prefixes and preserves prefix task text", async () => {
    const cwd = await tempDir();
    await writeSkill(path.join(cwd, "skills", "typescript"), "TypeScript body.");
    await writeSkill(path.join(cwd, "skills", "review"), "Review body.");
    const catalog = await loadSkillCatalog({ cwd });

    const normalized = normalizePromptTaskForSkillActivation("$TypeScript refactor this", undefined);
    expect(normalized.task).toBe("refactor this");
    expect(normalized.submission?.metadata?.requestedSkillName).toBe("TypeScript");

    const prefixed = resolveSkillActivation({
      task: "$TypeScript refactor this",
      catalog,
    });
    expect(prefixed?.entry?.normalizedName).toBe("typescript");
    expect(prefixed?.taskText).toBe("refactor this");

    const metadata = resolveSkillActivation({
      task: "$TypeScript refactor this",
      submission: { text: "$TypeScript refactor this", metadata: { requestedSkillName: "review" } },
      catalog,
    });
    expect(metadata?.entry?.normalizedName).toBe("review");
    expect(metadata?.taskText).toBe("$TypeScript refactor this");

    const unknown = resolveSkillActivation({
      task: "$Missing refactor this",
      catalog,
    });
    expect(unknown?.diagnostic?.message).toContain("not found");
  });

  it("loads activated bodies progressively and keeps inactive bodies out of context", async () => {
    const cwd = await tempDir();
    const activePath = path.join(cwd, "skills", "typescript");
    const inactivePath = path.join(cwd, "skills", "review");
    await writeSkill(activePath, [
      "---",
      "name: typescript",
      "description: Active catalog",
      "allowedTools: bash",
      "---",
      "ACTIVE BODY SECRET",
    ].join("\n"));
    await writeSkill(inactivePath, [
      "---",
      "name: review",
      "description: Inactive catalog",
      "---",
      "INACTIVE BODY SECRET",
    ].join("\n"));
    const catalog = await loadSkillCatalog({ cwd });
    await rm(inactivePath, { recursive: true, force: true });

    const result = await buildSkillContextItemsForRun({
      cwd,
      catalog,
      task: "$typescript apply this",
    });

    const combined = result.items.map((item) => item.content).join("\n");
    expect(combined).toContain("ACTIVE BODY SECRET");
    expect(combined).toContain("Inactive catalog");
    expect(combined).not.toContain("INACTIVE BODY SECRET");
    expect(result.items.find((item) => item.id === "skill:activated:typescript")?.metadata).toMatchObject({
      activationMode: "explicit",
      activationSource: "dollar_prefix",
      bodyLoaded: true,
      allowedTools: ["bash"],
    });
  });

  it("injects skills through context items before provider input assembly", async () => {
    const cwd = await tempDir();
    await writeSkill(path.join(cwd, "skills", "typescript"), [
      "---",
      "name: typescript",
      "description: TS catalog",
      "allowedTools:",
      "  - bash",
      "---",
      "ACTIVE BODY FOR PROVIDER",
    ].join("\n"));
    const provider = new StagedProvider([[{ type: "text_delta", text: "done" }, { type: "done" }]]);

    await runReactLoop({
      task: "$typescript refactor this file",
      model: "fixture-model",
      provider,
      cwd,
      middleware: [createSkillsMiddleware()],
      contextOptions: {
        includeInstructions: false,
        includeRuntime: false,
      },
    });

    const firstInput = provider.inputs[0];
    expect(firstInput?.messages.some((message) => message.role === "user" && message.content === "refactor this file")).toBe(true);
    expect(firstInput?.messages.some((message) => message.role === "system" && message.content.includes("ACTIVE BODY FOR PROVIDER"))).toBe(true);
    expect(firstInput?.tools).toBeUndefined();
  });

  it("keeps skill context visible in debug output when budgeted", async () => {
    const cwd = await tempDir();
    await writeSkill(path.join(cwd, "skills", "alpha"), [
      "---",
      "name: alpha",
      "description: Alpha catalog entry with enough words to exceed a tiny cap.",
      "priority: 2",
      "---",
      "Alpha body.",
    ].join("\n"));
    await writeSkill(path.join(cwd, "skills", "beta"), [
      "---",
      "name: beta",
      "description: Beta catalog entry with enough words to exceed a tiny cap.",
      "priority: 1",
      "---",
      "Beta body.",
    ].join("\n"));
    const provider = new StagedProvider([[{ type: "text_delta", text: "done" }, { type: "done" }]]);
    let debug: ProviderInput | undefined;
    let skillDebugItems: Array<{ cutReason?: string; metadata?: unknown }> = [];

    await runReactLoop({
      task: "use the catalog",
      model: "fixture-model",
      provider,
      cwd,
      middleware: [createSkillsMiddleware()],
      contextOptions: {
        includeInstructions: false,
        includeRuntime: false,
        budget: { perKindMaxTokens: { skill: 8 } },
      },
      onContextBuild(build) {
        debug = build.providerInput;
        skillDebugItems = build.debug.items
          .filter((item) => item.kind === "skill")
          .map((item) => ({ cutReason: item.cutReason, metadata: item.metadata }));
      },
    });

    expect(debug?.messages.some((message) => message.role === "user" && message.content === "use the catalog")).toBe(true);
    expect(skillDebugItems.length).toBeGreaterThan(0);
    expect(skillDebugItems.some((item) => item.cutReason === "over_kind_budget" || JSON.stringify(item.metadata ?? {}).includes("truncated"))).toBe(true);
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

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-stage10-"));
  tempDirs.push(dir);
  return dir;
}

async function writeSkill(skillDir: string, content: string): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), content);
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
