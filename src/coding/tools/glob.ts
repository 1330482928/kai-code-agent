import { z } from "zod";

import { createToolFailure, type JsonObject, type ToolDef, type ToolResult } from "../../foundation/tool.js";
import { isToolResult, resolveToolPath } from "./path.js";
import { runRipgrep } from "./grep.js";

const DEFAULT_GLOB_LIMIT = 100;
const MAX_GLOB_LIMIT = 500;

export const globInputSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).optional(),
  limit: z.number().int().positive().max(MAX_GLOB_LIMIT).optional(),
  rgPath: z.string().min(1).optional(),
});

export const globTool: ToolDef<typeof globInputSchema> = {
  name: "glob",
  description: "List workspace files matching a glob pattern.",
  inputSchema: globInputSchema,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      pattern: { type: "string", description: "Glob pattern such as **/*.ts or src/*.ts." },
      path: { type: "string", description: "Optional workspace-relative base path to list." },
      limit: { type: "integer", minimum: 1, maximum: MAX_GLOB_LIMIT, description: "Maximum files to return." },
    },
    required: ["pattern"],
  },
  formatPolicy: { maxModelChars: 6000, mode: "json", includeMetadataKeys: ["glob"] },
  async execute(input, context): Promise<ToolResult> {
    const unsafePattern = validateGlobPattern(input.pattern);
    if (unsafePattern) {
      return unsafePattern;
    }
    const limit = input.limit ?? DEFAULT_GLOB_LIMIT;
    const base = resolveToolPath(context.cwd, input.path ?? ".");
    if (isToolResult(base)) {
      return base;
    }

    const result = await runRipgrep(input.rgPath ?? "rg", ["--files", "--", base.relativePath], context.cwd, context.signal);
    if (result.status === "missing") {
      return createToolFailure("execution", "ripgrep executable 'rg' was not found", { tool: "glob" });
    }
    if (result.status === "error") {
      return createToolFailure("execution", `glob failed: ${result.stderr || result.message}`, {
        stderr: result.stderr || result.message,
      });
    }

    const matcher = globMatcher(input.pattern);
    const allMatches = result.stdout
      .split("\n")
      .filter(Boolean)
      .map(normalizePath)
      .filter((file) => matcher(file))
      .sort();
    const files = allMatches.slice(0, limit);
    return {
      ok: true,
      output: files.length === 0 ? `No files match '${input.pattern}'` : files.join("\n"),
      metadata: {
        glob: {
          pattern: input.pattern,
          path: base.relativePath,
          files,
          returned: files.length,
          limit,
          truncated: allMatches.length > limit,
        } satisfies JsonObject,
      },
    };
  },
};

export function globMatcher(pattern: string): (filePath: string) => boolean {
  const normalizedPattern = normalizePath(pattern);
  const regex = globToRegExp(normalizedPattern);
  const basenameRegex = normalizedPattern.includes("/") ? undefined : globToRegExp(normalizedPattern);
  return (filePath) => {
    const normalizedFile = normalizePath(filePath);
    if (regex.test(normalizedFile)) {
      return true;
    }
    if (!basenameRegex) {
      return false;
    }
    const basename = normalizedFile.split("/").pop() ?? normalizedFile;
    return basenameRegex.test(basename);
  };
}

export function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      if (pattern[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += escapeRegex(char ?? "");
  }
  source += "$";
  return new RegExp(source);
}

function validateGlobPattern(pattern: string): ToolResult | undefined {
  const normalized = normalizePath(pattern);
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
    return createToolFailure("permission", `Glob pattern '${pattern}' escapes the working directory`);
  }
  return undefined;
}

function normalizePath(value: string): string {
  return value.split("\\").join("/");
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
