import type { z } from "zod";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type ToolErrorKind =
  | "validation"
  | "not_found"
  | "permission"
  | "timeout"
  | "interrupted"
  | "parse_error"
  | "execution"
  | "unknown";

export interface ToolError {
  kind: ToolErrorKind;
  message: string;
  details?: JsonValue;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  metadata?: JsonObject;
  error?: ToolError;
}

export type ToolRuntimeEvent =
  | {
      type: "bash_progress";
      toolCallId: string;
      output: string;
      elapsedMs: number;
      totalBytes: number;
    }
  | {
      type: "tool_progress";
      toolCallId: string;
      message: string;
      metadata?: JsonObject;
    };

export interface ToolContext {
  cwd: string;
  signal: AbortSignal;
  sessionId: string;
  toolCallId: string;
  emit(event: ToolRuntimeEvent): void | Promise<void>;
}

export interface ProviderToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonObject;
  };
}

export interface ProviderRawToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ExecutableToolUse {
  id: string;
  name: string;
  input: JsonObject;
}

export interface ToolResultFormatPolicy {
  maxModelChars: number;
  mode: "body" | "summary" | "json";
  includeMetadataKeys?: string[];
}

export interface ToolDef<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TSchema;
  parameters: JsonObject;
  formatPolicy?: ToolResultFormatPolicy;
  execute(input: z.infer<TSchema>, context: ToolContext): Promise<ToolResult>;
}

export function createToolFailure(
  kind: ToolErrorKind,
  message: string,
  details?: JsonValue,
): ToolResult {
  return {
    ok: false,
    output: message,
    error: {
      kind,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseExecutableToolUse(raw: ProviderRawToolCall): ExecutableToolUse {
  let parsed: unknown;
  try {
    parsed = raw.arguments.trim().length === 0 ? {} : JSON.parse(raw.arguments);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Malformed tool arguments for '${raw.name}': ${message}`);
  }

  if (!isJsonObject(parsed)) {
    throw new Error(`Tool arguments for '${raw.name}' must be a JSON object`);
  }

  return {
    id: raw.id,
    name: raw.name,
    input: parsed,
  };
}
