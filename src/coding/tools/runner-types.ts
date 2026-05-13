import {
  createToolFailure,
  isJsonObject,
  type ExecutableToolUse,
  type ToolContext,
  type ToolDef,
  type ToolResult,
} from "../../foundation/tool.js";

export type ToolRegistryLike = Pick<Map<string, ToolDef>, "get"> | {
  get(name: string): ToolDef | undefined;
};

export {
  createToolFailure,
  isJsonObject,
};
export type {
  ExecutableToolUse,
  ToolContext,
  ToolResult,
};
