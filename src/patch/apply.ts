import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PatchApplyError,
  type PatchApplyResult,
  type PatchChange,
  type PatchCounts,
  type PatchHunk,
  type PatchLine,
  type PatchPlan,
  type PatchTouchedFile,
} from "./types.js";

interface FileState {
  absolutePath: string;
  relativePath: string;
  exists: boolean;
  content: string;
  dirty: boolean;
}

interface ResolvedPatchPath {
  absolutePath: string;
  relativePath: string;
}

export async function applyPatchPlan(cwd: string, plan: PatchPlan): Promise<PatchApplyResult> {
  const root = path.resolve(cwd);
  const states = new Map<string, FileState>();
  const originals = new Map<string, FileState>();
  const touchedFiles: PatchTouchedFile[] = [];
  const counts: PatchCounts = { add: 0, delete: 0, update: 0, move: 0 };

  const stateFor = async (filePath: string): Promise<FileState> => {
    const resolved = resolvePatchPath(root, filePath);
    const current = states.get(resolved.relativePath);
    if (current) {
      return current;
    }

    const loaded = await loadState(resolved);
    states.set(resolved.relativePath, loaded);
    originals.set(resolved.relativePath, { ...loaded });
    return loaded;
  };

  for (const change of plan.changes) {
    await stageChange(change, stateFor, touchedFiles, counts);
  }

  await commitStates(states, originals);
  const summary = summarizePatchApply(counts, touchedFiles);
  return { touchedFiles, counts, summary };
}

function resolvePatchPath(root: string, requestedPath: string): ResolvedPatchPath {
  const trimmed = requestedPath.trim();
  if (!trimmed) {
    throw new PatchApplyError("validation", "Patch path is required");
  }

  const absolutePath = path.resolve(root, trimmed);
  const relativePath = path.relative(root, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new PatchApplyError("permission", `Patch path '${requestedPath}' is outside the working directory`);
  }
  return {
    absolutePath,
    relativePath: relativePath.length === 0 ? "." : normalizeRelativePath(relativePath),
  };
}

async function loadState(resolved: ResolvedPatchPath): Promise<FileState> {
  try {
    const stats = await stat(resolved.absolutePath);
    if (stats.isDirectory()) {
      throw new PatchApplyError("validation", `Patch path '${resolved.relativePath}' is a directory`);
    }
    return {
      ...resolved,
      exists: true,
      content: await readFile(resolved.absolutePath, "utf8"),
      dirty: false,
    };
  } catch (error) {
    if (isNotFound(error)) {
      return {
        ...resolved,
        exists: false,
        content: "",
        dirty: false,
      };
    }
    throw error;
  }
}

async function stageChange(
  change: PatchChange,
  stateFor: (filePath: string) => Promise<FileState>,
  touchedFiles: PatchTouchedFile[],
  counts: PatchCounts,
): Promise<void> {
  if (change.type === "add") {
    const state = await stateFor(change.path);
    if (state.exists) {
      throw new PatchApplyError("validation", `File '${state.relativePath}' already exists`);
    }
    state.exists = true;
    state.content = `${change.lines.join("\n")}\n`;
    state.dirty = true;
    counts.add += 1;
    touchedFiles.push({ path: state.relativePath, operation: "add", bytes: Buffer.byteLength(state.content) });
    return;
  }

  if (change.type === "delete") {
    const state = await stateFor(change.path);
    if (!state.exists) {
      throw new PatchApplyError("not_found", `File '${state.relativePath}' does not exist`);
    }
    state.exists = false;
    state.content = "";
    state.dirty = true;
    counts.delete += 1;
    touchedFiles.push({ path: state.relativePath, operation: "delete" });
    return;
  }

  const state = await stateFor(change.path);
  if (!state.exists) {
    throw new PatchApplyError("not_found", `File '${state.relativePath}' does not exist`);
  }

  const updatedContent = applyHunks(state.relativePath, state.content, change.hunks);
  if (!change.moveTo) {
    state.content = updatedContent;
    state.dirty = true;
    counts.update += 1;
    touchedFiles.push({ path: state.relativePath, operation: "update", bytes: Buffer.byteLength(updatedContent) });
    return;
  }

  const target = await stateFor(change.moveTo);
  if (target.relativePath !== state.relativePath && target.exists) {
    throw new PatchApplyError("validation", `Move target '${target.relativePath}' already exists`);
  }

  if (target.relativePath === state.relativePath) {
    state.content = updatedContent;
    state.dirty = true;
    counts.update += 1;
    touchedFiles.push({ path: state.relativePath, operation: "update", bytes: Buffer.byteLength(updatedContent) });
    return;
  }

  state.exists = false;
  state.content = "";
  state.dirty = true;
  target.exists = true;
  target.content = updatedContent;
  target.dirty = true;
  counts.move += 1;
  if (change.hunks.length > 0) {
    counts.update += 1;
  }
  touchedFiles.push({
    path: state.relativePath,
    operation: "move",
    moveTo: target.relativePath,
    bytes: Buffer.byteLength(updatedContent),
  });
}

export function applyHunks(filePath: string, content: string, hunks: PatchHunk[]): string {
  if (hunks.length === 0) {
    return content;
  }

  const split = splitFileLines(content);
  let lines = [...split.lines];
  let cursor = 0;

  for (const hunk of hunks) {
    const pattern = hunk.lines.filter(isContextOrRemove).map((line) => line.text);
    const matchIndex = findHunkIndex(lines, pattern, cursor);
    if (matchIndex < 0) {
      throw new PatchApplyError("validation", `Patch hunk did not match '${filePath}'`);
    }

    const replacement = buildReplacement(lines, matchIndex, hunk.lines);
    lines = [
      ...lines.slice(0, matchIndex),
      ...replacement,
      ...lines.slice(matchIndex + pattern.length),
    ];
    cursor = matchIndex + replacement.length;
  }

  return lines.join("\n") + (split.hasFinalNewline ? "\n" : "");
}

function buildReplacement(lines: string[], matchIndex: number, hunkLines: PatchLine[]): string[] {
  const replacement: string[] = [];
  let sourceOffset = 0;

  for (const line of hunkLines) {
    if (line.kind === "context") {
      replacement.push(lines[matchIndex + sourceOffset] ?? line.text);
      sourceOffset += 1;
      continue;
    }
    if (line.kind === "remove") {
      sourceOffset += 1;
      continue;
    }
    replacement.push(line.text);
  }

  return replacement;
}

function findHunkIndex(lines: string[], pattern: string[], startIndex: number): number {
  if (pattern.length === 0) {
    return Math.min(startIndex, lines.length);
  }

  for (let index = startIndex; index <= lines.length - pattern.length; index += 1) {
    if (pattern.every((expected, offset) => lines[index + offset] === expected)) {
      return index;
    }
  }

  for (let index = startIndex; index <= lines.length - pattern.length; index += 1) {
    if (pattern.every((expected, offset) => (lines[index + offset] ?? "").trimEnd() === expected.trimEnd())) {
      return index;
    }
  }

  return -1;
}

async function commitStates(states: Map<string, FileState>, originals: Map<string, FileState>): Promise<void> {
  const dirtyStates = [...states.values()].filter((state) => state.dirty);
  try {
    for (const state of dirtyStates.filter((candidate) => candidate.exists)) {
      await mkdir(path.dirname(state.absolutePath), { recursive: true });
      await writeFile(state.absolutePath, state.content, "utf8");
    }
    for (const state of dirtyStates.filter((candidate) => !candidate.exists)) {
      const original = originals.get(state.relativePath);
      if (original?.exists) {
        await unlink(state.absolutePath);
      }
    }
  } catch (error) {
    await rollback(originals);
    const message = error instanceof Error ? error.message : String(error);
    throw new PatchApplyError("execution", `Failed to apply patch atomically: ${message}`);
  }
}

async function rollback(originals: Map<string, FileState>): Promise<void> {
  await Promise.all([...originals.values()].map(async (state) => {
    try {
      if (state.exists) {
        await mkdir(path.dirname(state.absolutePath), { recursive: true });
        await writeFile(state.absolutePath, state.content, "utf8");
      } else {
        await unlink(state.absolutePath);
      }
    } catch {
      // Best-effort rollback after a commit failure.
    }
  }));
}

function summarizePatchApply(counts: PatchCounts, touchedFiles: PatchTouchedFile[]): string {
  const countsText = [
    `${counts.add} added`,
    `${counts.update} updated`,
    `${counts.delete} deleted`,
    `${counts.move} moved`,
  ].join(", ");
  const files = touchedFiles.map((file) => file.moveTo ? `${file.path} -> ${file.moveTo}` : file.path).join(", ");
  return `Applied patch: ${countsText}${files ? ` (${files})` : ""}`;
}

function splitFileLines(content: string): { lines: string[]; hasFinalNewline: boolean } {
  const hasFinalNewline = content.endsWith("\n");
  const body = hasFinalNewline ? content.slice(0, -1) : content;
  return {
    lines: body.length === 0 ? [] : body.split("\n"),
    hasFinalNewline,
  };
}

function isContextOrRemove(line: PatchLine): boolean {
  return line.kind === "context" || line.kind === "remove";
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "ENOENT";
}
