import { open, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { parseSkillMarkdown } from "./frontmatter.js";
import type {
  DiscoveredSkill,
  ShadowedSkill,
  SkillDiagnostic,
  SkillDirectory,
  SkillDiscoveryResult,
} from "./types.js";

const FRONTMATTER_READ_BYTES = 16_384;

export interface DiscoverSkillsOptions {
  cwd: string;
  homeDir?: string;
  includeUser?: boolean;
  directories?: SkillDirectory[];
}

export function defaultSkillDirectories(input: {
  cwd: string;
  homeDir?: string;
  includeUser?: boolean;
}): SkillDirectory[] {
  const cwd = path.resolve(input.cwd);
  const includeUser = input.includeUser ?? true;
  const roots = [
    { path: path.join(cwd, "skills"), label: "project:skills" },
    { path: path.join(cwd, ".agents", "skills"), label: "project:.agents/skills" },
    { path: path.join(cwd, ".kai", "skills"), label: "project:.kai/skills" },
    ...(includeUser && input.homeDir
      ? [
          { path: path.join(input.homeDir, "skills"), label: "user:skills" },
          { path: path.join(input.homeDir, ".agents", "skills"), label: "user:.agents/skills" },
          { path: path.join(input.homeDir, ".kai-code-agent", "skills"), label: "user:.kai-code-agent/skills" },
        ]
      : []),
  ];
  return roots.map((root, index) => ({
    ...root,
    priority: roots.length - index,
  }));
}

export async function discoverSkills(options: DiscoverSkillsOptions): Promise<SkillDiscoveryResult> {
  const directories = options.directories ?? defaultSkillDirectories({
    cwd: options.cwd,
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    includeUser: options.includeUser,
  });
  const diagnostics: SkillDiagnostic[] = [];
  const entries: DiscoveredSkill[] = [];

  for (const directory of directories) {
    const dirents = await readDirectory(directory.path, diagnostics);
    if (!dirents) {
      continue;
    }
    for (const dirent of dirents) {
      if (!dirent.isDirectory()) {
        continue;
      }
      const skillDir = path.join(directory.path, dirent.name);
      const skillPath = path.join(skillDir, "SKILL.md");
      const content = await readSkillHeader(skillPath, diagnostics);
      if (content === undefined) {
        continue;
      }
      const parsed = parseSkillMarkdown({
        content,
        skillPath,
        directoryName: dirent.name,
      });
      const entry: DiscoveredSkill = {
        name: parsed.metadata.name,
        normalizedName: parsed.metadata.normalizedName,
        description: parsed.metadata.description,
        directoryPriority: directory.priority,
        directoryLabel: directory.label,
        skillDir,
        skillPath,
        diagnostics: parsed.diagnostics,
        ...(parsed.metadata.whenToUse ? { whenToUse: parsed.metadata.whenToUse } : {}),
        ...(parsed.metadata.allowedTools ? { allowedTools: parsed.metadata.allowedTools } : {}),
        ...(parsed.metadata.priority !== undefined ? { priority: parsed.metadata.priority } : {}),
      };
      entries.push(entry);
      diagnostics.push(...parsed.diagnostics);
    }
  }

  const { selected, shadowed } = resolveSkillDuplicates(entries);
  return {
    entries,
    selected,
    shadowed,
    diagnostics,
    directories,
  };
}

export function resolveSkillDuplicates(entries: DiscoveredSkill[]): {
  selected: DiscoveredSkill[];
  shadowed: ShadowedSkill[];
} {
  const groups = new Map<string, DiscoveredSkill[]>();
  for (const entry of entries) {
    const group = groups.get(entry.normalizedName) ?? [];
    group.push(entry);
    groups.set(entry.normalizedName, group);
  }

  const selected: DiscoveredSkill[] = [];
  const shadowed: ShadowedSkill[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort(compareSkillSelection);
    const winner = ordered[0];
    if (!winner) {
      continue;
    }
    selected.push(winner);
    for (const entry of ordered.slice(1)) {
      shadowed.push({
        entry,
        selected: winner,
        reason: shadowReason(entry, winner),
      });
    }
  }

  return {
    selected: selected.sort(compareSkillDisplay),
    shadowed: shadowed.sort((a, b) => compareSkillDisplay(a.entry, b.entry)),
  };
}

export function compareSkillDisplay(a: DiscoveredSkill, b: DiscoveredSkill): number {
  const nameCompare = a.normalizedName.localeCompare(b.normalizedName);
  if (nameCompare !== 0) {
    return nameCompare;
  }
  return a.skillPath.localeCompare(b.skillPath);
}

function compareSkillSelection(a: DiscoveredSkill, b: DiscoveredSkill): number {
  const priority = (b.priority ?? 0) - (a.priority ?? 0);
  if (priority !== 0) {
    return priority;
  }
  const directory = b.directoryPriority - a.directoryPriority;
  if (directory !== 0) {
    return directory;
  }
  return a.skillPath.localeCompare(b.skillPath);
}

function shadowReason(entry: DiscoveredSkill, selected: DiscoveredSkill): string {
  if ((entry.priority ?? 0) !== (selected.priority ?? 0)) {
    return `shadowed by ${selected.name}: lower priority`;
  }
  if (entry.directoryPriority !== selected.directoryPriority) {
    return `shadowed by ${selected.name}: lower directory priority`;
  }
  return `shadowed by ${selected.name}: stable path ordering`;
}

async function readDirectory(
  directory: string,
  diagnostics: SkillDiagnostic[],
): Promise<Dirent[] | undefined> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    diagnostics.push({
      severity: "error",
      path: directory,
      message: `Could not read skill directory: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
}

async function readSkillHeader(
  skillPath: string,
  diagnostics: SkillDiagnostic[],
): Promise<string | undefined> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(skillPath, "r");
    const buffer = Buffer.alloc(FRONTMATTER_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, FRONTMATTER_READ_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    diagnostics.push({
      severity: "error",
      path: skillPath,
      message: `Could not read skill metadata: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  } finally {
    await handle?.close();
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
