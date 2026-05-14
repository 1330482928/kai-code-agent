import { createToolFailure, type ToolResult } from "../foundation/tool.js";

export type McpFailureKind = "config" | "connection" | "list" | "call" | "close";

export class McpClientError extends Error {
  constructor(
    readonly serverName: string,
    readonly operation: McpFailureKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(`MCP server '${serverName}' ${operation} failed: ${message}`);
    this.name = "McpClientError";
  }
}

export class McpAdapterError extends Error {
  constructor(message: string, readonly serverName?: string) {
    super(message);
    this.name = "McpAdapterError";
  }
}

export function mcpErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function mcpErrorToToolResult(error: unknown, serverName: string, toolName: string): ToolResult {
  const message = mcpErrorMessage(error);
  return {
    ...createToolFailure("execution", message, {
      mcp: {
        serverName,
        toolName,
      },
    }),
    metadata: {
      mcp: {
        serverName,
        toolName,
      },
    },
  };
}
