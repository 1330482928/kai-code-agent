import type { McpServerConfig } from "./config.js";
import type { McpToolAdapterResult } from "./adapter.js";
import { mcpErrorMessage } from "./errors.js";

export function mcpToolName(serverName: string, toolName: string): string {
  return `mcp__${sanitizeMcpNameSegment(serverName)}__${sanitizeMcpNameSegment(toolName)}`;
}

export function parseMcpToolName(toolName: string): { serverName: string; toolName: string } | null {
  const match = /^mcp__([^_].*?)__(.+)$/.exec(toolName);
  if (!match) {
    return null;
  }
  return {
    serverName: match[1] ?? "",
    toolName: match[2] ?? "",
  };
}

export function sanitizeMcpNameSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "unnamed";
}

export function formatMcpListServerHeader(config: McpServerConfig): string {
  return `${config.name}\tapproval=${config.approval}`;
}

export function formatMcpListTool(tool: McpToolAdapterResult): string {
  const description = tool.description ? `\t${tool.description}` : "";
  return `  ${tool.name}${description}`;
}

export function formatMcpListError(serverName: string, error: unknown): string {
  return `${serverName}\tERROR\t${mcpErrorMessage(error)}`;
}
