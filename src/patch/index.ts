export { applyHunks, applyPatchPlan } from "./apply.js";
export { parsePatch } from "./parser.js";
export {
  PatchApplyError,
  PatchParseError,
} from "./types.js";
export type {
  PatchApplyResult,
  PatchChange,
  PatchCounts,
  PatchHunk,
  PatchLine,
  PatchLineKind,
  PatchPlan,
  PatchTouchedFile,
  PatchTouchedOperation,
} from "./types.js";
