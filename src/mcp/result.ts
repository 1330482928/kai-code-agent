import {
  createToolFailure,
  type JsonObject,
  type JsonValue,
  type ToolResult,
} from "../foundation/tool.js";

const MAX_MCP_OUTPUT_CHARS = 12_000;

export interface NormalizeMcpToolResultInput {
  serverName: string;
  toolName: string;
  result: unknown;
}

export function normalizeMcpToolResult(input: NormalizeMcpToolResultInput): ToolResult {
  const result = isJsonObject(input.result) ? input.result : {};
  const content = Array.isArray(result.content) ? result.content : [];
  const pieces: string[] = [];
  const contentTypes: string[] = [];

  for (const item of content) {
    const normalized = normalizeMcpContentItem(item);
    pieces.push(normalized.text);
    contentTypes.push(normalized.type);
  }

  if ("toolResult" in result) {
    pieces.push(formatCompatibilityToolResult(result.toolResult));
    contentTypes.push("toolResult");
  }

  const output = boundText(pieces.filter(Boolean).join("\n") || "MCP tool returned no content.", MAX_MCP_OUTPUT_CHARS);
  const metadata = mcpMetadata({
    serverName: input.serverName,
    toolName: input.toolName,
    contentTypes,
    isError: result.isError === true,
    structuredContent: result.structuredContent,
  });

  if (result.isError === true) {
    return {
      ...createToolFailure("execution", output, metadata),
      metadata,
    };
  }

  return {
    ok: true,
    output,
    metadata,
  };
}

function normalizeMcpContentItem(item: unknown): { type: string; text: string } {
  if (!isJsonObject(item)) {
    return { type: "unknown", text: "[unknown MCP content]" };
  }

  if (item.type === "text" && typeof item.text === "string") {
    return { type: "text", text: item.text };
  }

  if (item.type === "image") {
    const mimeType = typeof item.mimeType === "string" ? item.mimeType : "unknown";
    const size = typeof item.data === "string" ? item.data.length : 0;
    return { type: "image", text: `[image ${mimeType}, ${size} encoded chars]` };
  }

  if (item.type === "audio") {
    const mimeType = typeof item.mimeType === "string" ? item.mimeType : "unknown";
    const size = typeof item.data === "string" ? item.data.length : 0;
    return { type: "audio", text: `[audio ${mimeType}, ${size} encoded chars]` };
  }

  if (item.type === "resource" && isJsonObject(item.resource)) {
    const uri = typeof item.resource.uri === "string" ? item.resource.uri : "unknown";
    if (typeof item.resource.text === "string") {
      return { type: "resource", text: `[resource ${uri}]\n${item.resource.text}` };
    }
    const mimeType = typeof item.resource.mimeType === "string" ? item.resource.mimeType : "unknown";
    return { type: "resource", text: `[resource ${uri}, ${mimeType}]` };
  }

  if (item.type === "resource_link") {
    const uri = typeof item.uri === "string" ? item.uri : "unknown";
    const name = typeof item.name === "string" ? item.name : uri;
    return { type: "resource_link", text: `[resource link ${name}: ${uri}]` };
  }

  return {
    type: typeof item.type === "string" ? item.type : "unknown",
    text: `[${typeof item.type === "string" ? item.type : "unknown"} MCP content]`,
  };
}

function formatCompatibilityToolResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (isJsonValue(value)) {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function mcpMetadata(input: {
  serverName: string;
  toolName: string;
  contentTypes: string[];
  isError: boolean;
  structuredContent: unknown;
}): JsonObject {
  return {
    mcp: {
      serverName: input.serverName,
      toolName: input.toolName,
      contentTypes: input.contentTypes,
      isError: input.isError,
      ...(isJsonObject(input.structuredContent) ? { structuredContent: input.structuredContent } : {}),
    },
  };
}

function boundText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isJsonObject(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}
