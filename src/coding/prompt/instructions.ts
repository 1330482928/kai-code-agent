import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { createContextItem, type ContextItem } from "../context/items.js";

const INSTRUCTION_FILENAMES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"] as const;
const DEFAULT_INSTRUCTION_LIMIT = 12_000;

export interface InstructionLoadOptions {
  cwd: string;
  root?: string;
  filenames?: readonly string[];
  maxChars?: number;
}

export async function loadInstructionItems(options: InstructionLoadOptions): Promise<ContextItem[]> {
  const cwd = path.resolve(options.cwd);
  const root = path.resolve(options.root ?? await findWorkspaceRoot(cwd));
  const filenames = options.filenames ?? INSTRUCTION_FILENAMES;
  const maxChars = options.maxChars ?? DEFAULT_INSTRUCTION_LIMIT;
  const dirs = pathChain(root, cwd);
  const items: ContextItem[] = [];

  for (const [dirIndex, dir] of dirs.entries()) {
    for (const [fileIndex, filename] of filenames.entries()) {
      const filePath = path.join(dir, filename);
      try {
        const info = await stat(filePath);
        if (!info.isFile()) {
          continue;
        }
        const raw = await readFile(filePath, "utf8");
        const content = boundText(raw, maxChars);
        items.push(createContextItem({
          id: `instruction:${path.relative(root, filePath) || filename}`,
          kind: "instruction",
          source: filePath,
          content,
          priority: 20 + dirIndex * 10 + fileIndex,
          cacheStable: true,
          metadata: {
            path: filePath,
            filename,
            bytes: Buffer.byteLength(raw),
            truncated: raw.length > content.length,
            order: "root-first",
          },
        }));
      } catch {
        // Missing or unreadable instruction files are not fatal context errors.
      }
    }
  }

  return items;
}

export async function findWorkspaceRoot(cwd: string): Promise<string> {
  let current = path.resolve(cwd);
  const root = path.parse(current).root;
  for (;;) {
    if (await pathExists(path.join(current, ".git")) || await pathExists(path.join(current, "package.json"))) {
      return current;
    }
    if (current === root) {
      return path.resolve(cwd);
    }
    current = path.dirname(current);
  }
}

function pathChain(root: string, cwd: string): string[] {
  const resolvedRoot = path.resolve(root);
  let current = path.resolve(cwd);
  const dirs = [current];
  while (current !== resolvedRoot && current !== path.dirname(current)) {
    current = path.dirname(current);
    dirs.push(current);
  }
  if (dirs[dirs.length - 1] !== resolvedRoot) {
    dirs.push(resolvedRoot);
  }
  return dirs.reverse();
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function boundText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n[truncated ${text.length - limit} chars]`;
}
