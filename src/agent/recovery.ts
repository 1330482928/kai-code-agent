import {
  createToolFailure,
  type ExecutableToolUse,
  type ToolErrorKind,
  type ToolResult,
} from "../foundation/tool.js";
import { normalizeError } from "../coding/tools/errors.js";
import type { ToolAssemblyResult } from "./tool-accumulator.js";

const RAW_ARGUMENT_PREVIEW_CHARS = 1000;

export function toolUseFromInvalidAssembly(result: Extract<ToolAssemblyResult, { type: "invalid" }>): ExecutableToolUse {
  return {
    id: result.id,
    name: result.name,
    input: {},
  };
}

export function parseFailureToolResult(result: Extract<ToolAssemblyResult, { type: "invalid" }>): ToolResult {
  return createToolFailure("parse_error", `Malformed tool arguments for '${result.name}': ${result.reason}`, {
    rawArguments: boundText(result.rawArguments, RAW_ARGUMENT_PREVIEW_CHARS),
    recovered: true,
  });
}

export function providerFailureToolResult(toolUse: ExecutableToolUse, error: unknown): ToolResult {
  const normalized = normalizeError(error);
  return createToolFailure(normalized.kind, `Tool '${toolUse.name}' was not executed because provider streaming failed: ${normalized.message}`, {
    recovered: true,
    toolCallId: toolUse.id,
    toolName: toolUse.name,
    ...(normalized.details === undefined ? {} : { cause: normalized.details }),
  });
}

export function pendingToolResult(toolUse: ExecutableToolUse, reason: string, kind: ToolErrorKind = "execution"): ToolResult {
  return createToolFailure(kind, `Tool '${toolUse.name}' did not complete: ${reason}`, {
    recovered: true,
    toolCallId: toolUse.id,
    toolName: toolUse.name,
  });
}

export function summarizeRecoveredError(error: unknown): string {
  return normalizeError(error).message;
}

function boundText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}
