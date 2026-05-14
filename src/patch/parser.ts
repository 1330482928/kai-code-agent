import { PatchParseError, type PatchChange, type PatchHunk, type PatchLine, type PatchPlan } from "./types.js";

const BEGIN_MARKER = "*** Begin Patch";
const END_MARKER = "*** End Patch";
const ADD_PREFIX = "*** Add File: ";
const DELETE_PREFIX = "*** Delete File: ";
const UPDATE_PREFIX = "*** Update File: ";
const MOVE_PREFIX = "*** Move to: ";
const END_OF_FILE_MARKER = "*** End of File";

export function parsePatch(patch: string): PatchPlan {
  const lines = patch.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  trimTrailingEmptyLine(lines);

  if (lines[0] !== BEGIN_MARKER) {
    throw new PatchParseError(`Patch must start with '${BEGIN_MARKER}'`);
  }
  if (lines[lines.length - 1] !== END_MARKER) {
    throw new PatchParseError(`Patch must end with '${END_MARKER}'`);
  }

  const changes: PatchChange[] = [];
  let index = 1;
  while (index < lines.length - 1) {
    const line = lines[index] ?? "";
    if (line.startsWith(ADD_PREFIX)) {
      const parsed = parseAdd(lines, index);
      changes.push(parsed.change);
      index = parsed.nextIndex;
      continue;
    }
    if (line.startsWith(DELETE_PREFIX)) {
      changes.push({ type: "delete", path: parsePathHeader(line, DELETE_PREFIX, index) });
      index += 1;
      continue;
    }
    if (line.startsWith(UPDATE_PREFIX)) {
      const parsed = parseUpdate(lines, index);
      changes.push(parsed.change);
      index = parsed.nextIndex;
      continue;
    }
    throw new PatchParseError(`Unexpected patch line ${index + 1}: ${line}`);
  }

  if (changes.length === 0) {
    throw new PatchParseError("Patch must contain at least one file change");
  }
  return { changes };
}

function parseAdd(lines: string[], startIndex: number): { change: PatchChange; nextIndex: number } {
  const path = parsePathHeader(lines[startIndex] ?? "", ADD_PREFIX, startIndex);
  const addedLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length - 1 && !isFileHeader(lines[index] ?? "")) {
    const line = lines[index] ?? "";
    if (!line.startsWith("+")) {
      throw new PatchParseError(`Add file line ${index + 1} must start with '+'`);
    }
    addedLines.push(line.slice(1));
    index += 1;
  }

  if (addedLines.length === 0) {
    throw new PatchParseError(`Add file '${path}' must contain at least one added line`);
  }
  return {
    change: { type: "add", path, lines: addedLines },
    nextIndex: index,
  };
}

function parseUpdate(lines: string[], startIndex: number): { change: PatchChange; nextIndex: number } {
  const path = parsePathHeader(lines[startIndex] ?? "", UPDATE_PREFIX, startIndex);
  let index = startIndex + 1;
  let moveTo: string | undefined;
  const hunks: PatchHunk[] = [];

  if ((lines[index] ?? "").startsWith(MOVE_PREFIX)) {
    moveTo = parsePathHeader(lines[index] ?? "", MOVE_PREFIX, index);
    index += 1;
  }

  while (index < lines.length - 1 && !isFileHeader(lines[index] ?? "")) {
    const line = lines[index] ?? "";
    if (line === END_OF_FILE_MARKER) {
      index += 1;
      continue;
    }
    if (!line.startsWith("@@")) {
      throw new PatchParseError(`Update file line ${index + 1} must start a hunk with '@@'`);
    }

    const hunk: PatchHunk = {
      ...(line.length > 2 ? { header: line.slice(2).trim() } : {}),
      lines: [],
    };
    index += 1;

    while (index < lines.length - 1 && !isFileHeader(lines[index] ?? "") && !(lines[index] ?? "").startsWith("@@")) {
      const hunkLine = lines[index] ?? "";
      if (hunkLine === END_OF_FILE_MARKER) {
        index += 1;
        continue;
      }
      hunk.lines.push(parseHunkLine(hunkLine, index));
      index += 1;
    }

    if (hunk.lines.length === 0) {
      throw new PatchParseError(`Update hunk for '${path}' at line ${index + 1} must contain at least one change line`);
    }
    hunks.push(hunk);
  }

  if (!moveTo && hunks.length === 0) {
    throw new PatchParseError(`Update file '${path}' must contain a move target or at least one hunk`);
  }
  return {
    change: { type: "update", path, ...(moveTo ? { moveTo } : {}), hunks },
    nextIndex: index,
  };
}

function parseHunkLine(line: string, index: number): PatchLine {
  const prefix = line[0];
  if (prefix === " ") {
    return { kind: "context", text: line.slice(1) };
  }
  if (prefix === "+") {
    return { kind: "add", text: line.slice(1) };
  }
  if (prefix === "-") {
    return { kind: "remove", text: line.slice(1) };
  }
  throw new PatchParseError(`Hunk line ${index + 1} must start with ' ', '+', or '-'`);
}

function parsePathHeader(line: string, prefix: string, index: number): string {
  const path = line.slice(prefix.length).trim();
  if (!path) {
    throw new PatchParseError(`Patch line ${index + 1} is missing a file path`);
  }
  return path;
}

function isFileHeader(line: string): boolean {
  return line.startsWith(ADD_PREFIX) || line.startsWith(DELETE_PREFIX) || line.startsWith(UPDATE_PREFIX);
}

function trimTrailingEmptyLine(lines: string[]): void {
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
}
