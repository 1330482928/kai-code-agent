import type { JsonObject, JsonValue, ToolResult } from "../foundation/tool.js";

const DEFAULT_MAX_MODEL_CHARS = 6000;
const TOOL_LIMITS: Record<string, number> = {
  read_file: 12000,
  write_file: 1200,
  edit_file: 1600,
  grep: 6000,
  glob: 6000,
  apply_patch: 4000,
  bash: 8000,
};

export function formatToolResultForModel(toolName: string, rawResult: ToolResult): string {
  if (!rawResult.ok) {
    return boundedJson({
      ok: false,
      error: {
        kind: rawResult.error?.kind ?? "unknown",
        message: rawResult.error?.message ?? rawResult.output,
      },
      details: rawResult.error?.details,
    }, limitFor(toolName));
  }

  if (toolName === "bash") {
    return boundedJson(formatBash(rawResult), limitFor(toolName));
  }

  if (toolName === "write_file") {
    return boundedJson({
      ok: true,
      path: rawResult.metadata?.path,
      bytes: rawResult.metadata?.bytes,
      summary: rawResult.output,
    }, limitFor(toolName));
  }

  if (toolName === "edit_file") {
    return boundedJson({
      ok: true,
      path: rawResult.metadata?.path,
      replacements: rawResult.metadata?.replacements,
      diff: rawResult.metadata?.diff,
      summary: rawResult.output,
    }, limitFor(toolName));
  }

  if (toolName === "read_file") {
    const metadata = rawResult.metadata ?? {};
    const prefix = [
      `ok: true`,
      `path: ${stringValue(metadata.path)}`,
      `offset: ${stringValue(metadata.offset)}`,
      `limit: ${stringValue(metadata.limit)}`,
      `truncated: ${stringValue(metadata.truncated)}`,
      "",
    ].join("\n");
    return boundText(`${prefix}${rawResult.output}`, limitFor(toolName));
  }

  if (toolName === "grep") {
    const grep = isJsonObject(rawResult.metadata?.grep) ? rawResult.metadata.grep : {};
    return boundedJson({
      ok: true,
      pattern: grep.pattern ?? "",
      path: grep.path ?? "",
      matches: Array.isArray(grep.matches) ? grep.matches : [],
      returned: grep.returned ?? 0,
      limit: grep.limit ?? null,
      truncated: grep.truncated ?? false,
      summary: rawResult.output,
    }, limitFor(toolName));
  }

  if (toolName === "glob") {
    const glob = isJsonObject(rawResult.metadata?.glob) ? rawResult.metadata.glob : {};
    return boundedJson({
      ok: true,
      pattern: glob.pattern ?? "",
      path: glob.path ?? "",
      files: Array.isArray(glob.files) ? glob.files : [],
      returned: glob.returned ?? 0,
      limit: glob.limit ?? null,
      truncated: glob.truncated ?? false,
      summary: rawResult.output,
    }, limitFor(toolName));
  }

  if (toolName === "apply_patch") {
    const patch = isJsonObject(rawResult.metadata?.patch) ? rawResult.metadata.patch : {};
    return boundedJson({
      ok: true,
      counts: isJsonObject(patch.counts) ? patch.counts : {},
      touchedFiles: Array.isArray(patch.touchedFiles) ? patch.touchedFiles : [],
      summary: patch.summary ?? rawResult.output,
    }, limitFor(toolName));
  }

  return boundedJson({
    ok: true,
    output: rawResult.output,
    metadata: rawResult.metadata,
  }, limitFor(toolName));
}

function formatBash(rawResult: ToolResult): JsonObject {
  const bash = isJsonObject(rawResult.metadata?.bash) ? rawResult.metadata.bash : {};
  return {
    ok: true,
    command: bash.command ?? "",
    exitCode: bash.exitCode ?? null,
    interrupted: bash.interrupted ?? false,
    stdoutPreview: bash.stdoutPreview ?? "",
    stderrPreview: bash.stderrPreview ?? "",
    outputBytes: bash.outputBytes ?? 0,
    ...(typeof bash.persistedOutputPath === "string"
      ? { persistedOutputPath: bash.persistedOutputPath }
      : {}),
  };
}

function boundedJson(value: unknown, maxChars: number): string {
  return boundText(JSON.stringify(value, null, 2), maxChars);
}

function boundText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function limitFor(toolName: string): number {
  return TOOL_LIMITS[toolName] ?? DEFAULT_MAX_MODEL_CHARS;
}

function stringValue(value: JsonValue | undefined): string {
  if (value === undefined) {
    return "";
  }
  return String(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
