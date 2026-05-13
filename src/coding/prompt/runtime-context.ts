import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import { createContextItem, type ContextItem } from "../context/items.js";

const execFileAsync = promisify(execFile);

export interface RuntimeContextOptions {
  cwd: string;
  now?: () => Date;
  includeGit?: boolean;
}

export async function buildRuntimeContextItems(options: RuntimeContextOptions): Promise<ContextItem[]> {
  const now = options.now?.() ?? new Date();
  const facts = [
    `cwd: ${path.resolve(options.cwd)}`,
    `date: ${now.toISOString()}`,
    `runtime: bun/typescript`,
  ];

  if (options.includeGit !== false) {
    const git = await readGitSummary(options.cwd);
    if (git) {
      facts.push(`git: ${git}`);
    }
  }

  return [
    createContextItem({
      id: "environment:runtime",
      kind: "environment",
      source: "runtime.local",
      priority: 30,
      cacheStable: false,
      content: facts.join("\n"),
      metadata: {
        cwd: path.resolve(options.cwd),
        date: now.toISOString(),
      },
    }),
  ];
}

async function readGitSummary(cwd: string): Promise<string | undefined> {
  try {
    const branch = await execGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const status = await execGit(cwd, ["status", "--short"]);
    const statusLines = status.trim().split("\n").filter(Boolean);
    return `${branch.trim()} (${statusLines.length} changed)`;
  } catch {
    return undefined;
  }
}

async function execGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", cwd, ...args], {
    timeout: 1000,
    maxBuffer: 64 * 1024,
  });
  return result.stdout;
}
