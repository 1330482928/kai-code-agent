import type { ToolErrorKind } from "../foundation/tool.js";

export type PatchLineKind = "context" | "add" | "remove";

export interface PatchLine {
  kind: PatchLineKind;
  text: string;
}

export interface PatchHunk {
  header?: string;
  lines: PatchLine[];
}

export type PatchChange =
  | {
      type: "add";
      path: string;
      lines: string[];
    }
  | {
      type: "delete";
      path: string;
    }
  | {
      type: "update";
      path: string;
      moveTo?: string;
      hunks: PatchHunk[];
    };

export interface PatchPlan {
  changes: PatchChange[];
}

export class PatchParseError extends Error {
  readonly kind = "parse_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "PatchParseError";
  }
}

export class PatchApplyError extends Error {
  constructor(readonly kind: ToolErrorKind, message: string) {
    super(message);
    this.name = "PatchApplyError";
  }
}

export type PatchTouchedOperation = "add" | "delete" | "update" | "move";

export interface PatchTouchedFile {
  path: string;
  operation: PatchTouchedOperation;
  bytes?: number;
  moveTo?: string;
}

export interface PatchCounts {
  add: number;
  delete: number;
  update: number;
  move: number;
}

export interface PatchApplyResult {
  touchedFiles: PatchTouchedFile[];
  counts: PatchCounts;
  summary: string;
}
