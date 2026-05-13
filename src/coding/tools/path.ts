import path from "node:path";

import { createToolFailure, type ToolResult } from "../../foundation/tool.js";

export interface ResolvedToolPath {
  absolutePath: string;
  relativePath: string;
}

export function resolveToolPath(cwd: string, requestedPath: string): ResolvedToolPath | ToolResult {
  const trimmed = requestedPath.trim();
  if (!trimmed) {
    return createToolFailure("validation", "Path is required");
  }

  const root = path.resolve(cwd);
  const absolutePath = path.resolve(root, trimmed);
  const relativePath = path.relative(root, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return createToolFailure("permission", `Path '${requestedPath}' is outside the working directory`);
  }

  return {
    absolutePath,
    relativePath: relativePath.length === 0 ? "." : normalizeRelativePath(relativePath),
  };
}

export function isToolResult(value: ResolvedToolPath | ToolResult): value is ToolResult {
  return "ok" in value;
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}
