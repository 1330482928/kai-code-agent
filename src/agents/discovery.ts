import { open, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { parseAgentMarkdown } from "./frontmatter.js";
import type {
  AgentCatalog,
  AgentCatalogEntry,
  AgentDiagnostic,
  AgentDirectory,
  DiscoveredAgent,
} from "./types.js";

const FRONTMATTER_READ_BYTES = 16_384;

export interface DiscoverAgentsOptions {
  cwd: string;
  directories?: AgentDirectory[];
}

export function defaultAgentDirectories(input: { cwd: string }): AgentDirectory[] {
  const cwd = path.resolve(input.cwd);
  return [{
    path: path.join(cwd, ".kai", "agents"),
    label: "project:.kai/agents",
  }];
}

export async function discoverAgents(options: DiscoverAgentsOptions): Promise<AgentCatalog> {
  const directories = options.directories ?? defaultAgentDirectories({ cwd: options.cwd });
  const diagnostics: AgentDiagnostic[] = [];
  const entries: DiscoveredAgent[] = [];

  for (const directory of directories) {
    const dirents = await readDirectory(directory.path, diagnostics);
    if (!dirents) {
      continue;
    }
    for (const dirent of dirents) {
      if (!dirent.isFile() || !dirent.name.endsWith(".md")) {
        continue;
      }
      const agentPath = path.join(directory.path, dirent.name);
      const content = await readAgentHeader(agentPath, diagnostics);
      if (content === undefined) {
        continue;
      }
      const parsed = parseAgentMarkdown({
        content,
        agentPath,
        directoryName: path.basename(dirent.name, ".md"),
      });
      const entry: DiscoveredAgent = {
        name: parsed.metadata.name,
        normalizedName: parsed.metadata.normalizedName,
        description: parsed.metadata.description,
        prompt: parsed.metadata.prompt,
        tools: parsed.metadata.tools,
        ...(parsed.metadata.skills ? { skills: parsed.metadata.skills } : {}),
        ...(parsed.metadata.maxTurns !== undefined ? { maxTurns: parsed.metadata.maxTurns } : {}),
        sourcePath: agentPath,
        bodyPreview: parsed.bodyPreview,
        diagnostics: parsed.diagnostics,
        directoryLabel: directory.label,
      };
      entries.push(entry);
      diagnostics.push(...parsed.diagnostics);
    }
  }

  const selected = entries
    .slice()
    .sort(compareAgentDisplay)
    .map((entry) => toCatalogEntry(entry));

  return {
    selected,
    all: selected,
    diagnostics,
  };
}

export function findAgentCatalogEntry(
  catalog: Pick<AgentCatalog, "selected">,
  requestedName: string,
): AgentCatalogEntry | undefined {
  const normalizedName = requestedName.trim().toLowerCase();
  return catalog.selected.find((entry) => entry.normalizedName === normalizedName);
}

export function formatAgentCatalogList(catalog: AgentCatalog, options: { all?: boolean } = {}): string {
  const entries = options.all ? catalog.all : catalog.selected;
  if (entries.length === 0) {
    return "No agents found.\n";
  }

  const header = "name\ttools\tskills\tsource\tdescription";
  const rows = entries.map((entry) => [
    entry.name,
    entry.tools.join(", "),
    entry.skills?.join(", ") ?? "",
    entry.sourcePath,
    entry.description,
  ].join("\t"));
  return `${[header, ...rows].join("\n")}\n`;
}

function toCatalogEntry(entry: DiscoveredAgent): AgentCatalogEntry {
  return {
    name: entry.name,
    normalizedName: entry.normalizedName,
    description: entry.description,
    prompt: entry.prompt,
    tools: entry.tools,
    sourcePath: entry.sourcePath,
    bodyPreview: entry.bodyPreview,
    directoryLabel: entry.directoryLabel,
    ...(entry.skills ? { skills: entry.skills } : {}),
    ...(entry.maxTurns !== undefined ? { maxTurns: entry.maxTurns } : {}),
    ...(entry.diagnostics.length > 0 ? { diagnostics: entry.diagnostics } : {}),
  };
}

export function compareAgentDisplay(a: DiscoveredAgent, b: DiscoveredAgent): number {
  const nameCompare = a.normalizedName.localeCompare(b.normalizedName);
  if (nameCompare !== 0) {
    return nameCompare;
  }
  return a.sourcePath.localeCompare(b.sourcePath);
}

async function readDirectory(
  directory: string,
  diagnostics: AgentDiagnostic[],
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
      message: `Could not read agent directory: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
}

async function readAgentHeader(
  agentPath: string,
  diagnostics: AgentDiagnostic[],
): Promise<string | undefined> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(agentPath, "r");
    const buffer = Buffer.alloc(FRONTMATTER_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, FRONTMATTER_READ_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    diagnostics.push({
      severity: "error",
      path: agentPath,
      message: `Could not read agent metadata: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  } finally {
    await handle?.close();
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
