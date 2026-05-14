import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { z } from "zod";

import { createToolFailure, type JsonObject, type ToolDef, type ToolResult } from "../../foundation/tool.js";
import { isToolResult, resolveToolPath } from "./path.js";

const execFileAsync = promisify(execFile);
const DEFAULT_GREP_LIMIT = 50;
const MAX_GREP_LIMIT = 200;
const PREVIEW_CHARS = 240;

export const grepInputSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).optional(),
  limit: z.number().int().positive().max(MAX_GREP_LIMIT).optional(),
  caseSensitive: z.boolean().optional(),
  fixedStrings: z.boolean().optional(),
  rgPath: z.string().min(1).optional(),
});

export const grepTool: ToolDef<typeof grepInputSchema> = {
  name: "grep",
  description: "Search workspace text with ripgrep and return bounded file/line matches.",
  inputSchema: grepInputSchema,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      pattern: { type: "string", description: "Ripgrep search pattern." },
      path: { type: "string", description: "Optional workspace-relative path to search." },
      limit: { type: "integer", minimum: 1, maximum: MAX_GREP_LIMIT, description: "Maximum matches to return." },
      caseSensitive: { type: "boolean", description: "Use case-sensitive search when true." },
      fixedStrings: { type: "boolean", description: "Treat pattern as a literal string when true." },
    },
    required: ["pattern"],
  },
  formatPolicy: { maxModelChars: 6000, mode: "json", includeMetadataKeys: ["grep"] },
  async execute(input, context): Promise<ToolResult> {
    const limit = input.limit ?? DEFAULT_GREP_LIMIT;
    const base = resolveToolPath(context.cwd, input.path ?? ".");
    if (isToolResult(base)) {
      return base;
    }

    const args = [
      "--line-number",
      "--with-filename",
      "--no-heading",
      "--color",
      "never",
      "--max-count",
      String(limit + 1),
      ...(input.caseSensitive === true ? ["--case-sensitive"] : ["--ignore-case"]),
      ...(input.fixedStrings === true ? ["--fixed-strings"] : []),
      "--",
      input.pattern,
      base.relativePath,
    ];

    const result = await runRipgrep(input.rgPath ?? "rg", args, context.cwd, context.signal);
    if (result.status === "missing") {
      return createToolFailure("execution", "ripgrep executable 'rg' was not found", { tool: "grep" });
    }
    if (result.status === "error") {
      return createToolFailure("validation", `grep failed: ${preview(result.stderr || result.message)}`, {
        stderr: preview(result.stderr || result.message),
      });
    }

    const allMatches = parseGrepLines(result.stdout);
    const matches = allMatches.slice(0, limit);
    const matchMetadata = matches.map((match): JsonObject => ({
      path: match.path,
      line: match.line,
      preview: match.preview,
    }));
    const truncated = allMatches.length > limit;
    return {
      ok: true,
      output: matches.length === 0
        ? `No matches for '${input.pattern}'`
        : matches.map((match) => `${match.path}:${match.line}:${match.preview}`).join("\n"),
      metadata: {
        grep: {
          pattern: input.pattern,
          path: base.relativePath,
          matches: matchMetadata,
          returned: matches.length,
          limit,
          truncated,
        },
      },
    };
  },
};

export interface GrepMatch {
  path: string;
  line: number;
  preview: string;
}

export function parseGrepLines(stdout: string): GrepMatch[] {
  return stdout.split("\n").filter(Boolean).flatMap((line) => {
    const first = line.indexOf(":");
    const second = first >= 0 ? line.indexOf(":", first + 1) : -1;
    if (first < 0 || second < 0) {
      return [];
    }
    const lineNumber = Number(line.slice(first + 1, second));
    if (!Number.isFinite(lineNumber)) {
      return [];
    }
    return [{
      path: normalizePath(line.slice(0, first)),
      line: lineNumber,
      preview: preview(line.slice(second + 1)),
    }];
  });
}

interface RipgrepSuccess {
  status: "success";
  stdout: string;
  stderr: string;
}

interface RipgrepNoMatch {
  status: "success";
  stdout: "";
  stderr: string;
}

interface RipgrepError {
  status: "error";
  message: string;
  stderr: string;
}

interface RipgrepMissing {
  status: "missing";
}

type RipgrepResult = RipgrepSuccess | RipgrepNoMatch | RipgrepError | RipgrepMissing;

export async function runRipgrep(
  rgPath: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
): Promise<RipgrepResult> {
  try {
    const result = await execFileAsync(rgPath, args, {
      cwd,
      signal,
      maxBuffer: 512 * 1024,
    });
    return {
      status: "success",
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    if (isExecError(error) && error.code === 1) {
      return { status: "success", stdout: "", stderr: error.stderr ?? "" };
    }
    if (isExecError(error) && error.code === "ENOENT") {
      return { status: "missing" };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      stderr: isExecError(error) ? error.stderr ?? "" : "",
    };
  }
}

function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= PREVIEW_CHARS ? oneLine : `${oneLine.slice(0, PREVIEW_CHARS - 3)}...`;
}

function normalizePath(value: string): string {
  return value.split("\\").join("/");
}

function isExecError(error: unknown): error is Error & { code?: string | number; stderr?: string } {
  return typeof error === "object" && error !== null;
}
