import { z } from "zod";

import type { HumanInteractionManager } from "../agent/human-interaction-manager.js";
import {
  createToolFailure,
  isJsonObject,
  type JsonObject,
  type JsonValue,
  type ToolDef,
  type ToolResult,
} from "../foundation/tool.js";
import type { McpServerConfig } from "./config.js";
import type { McpClientManager, McpToolDefinition } from "./client.js";
import { McpAdapterError, mcpErrorToToolResult } from "./errors.js";
import { mcpToolName } from "./format.js";
import { normalizeMcpToolResult } from "./result.js";

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const mcpToolInputSchema = z.record(jsonValueSchema);

export interface McpToolAdapterResult {
  name: string;
  rawName: string;
  serverName: string;
  description: string;
  tool: ToolDef<typeof mcpToolInputSchema>;
}

export interface AdaptMcpToolsOptions {
  server: McpServerConfig;
  tools: McpToolDefinition[];
  clientManager: Pick<McpClientManager, "callTool">;
  humanInteractionManager?: HumanInteractionManager;
}

export function adaptMcpTools(options: AdaptMcpToolsOptions): McpToolAdapterResult[] {
  const adapted: McpToolAdapterResult[] = [];
  const seen = new Map<string, string>();

  for (const tool of options.tools) {
    const name = mcpToolName(options.server.name, tool.name);
    const existing = seen.get(name);
    if (existing) {
      throw new McpAdapterError(
        `MCP tool name collision for server '${options.server.name}': '${existing}' and '${tool.name}' both map to '${name}'`,
        options.server.name,
      );
    }
    seen.set(name, tool.name);

    const description = tool.description ?? `MCP tool ${tool.name} from ${options.server.name}`;
    adapted.push({
      name,
      rawName: tool.name,
      serverName: options.server.name,
      description,
      tool: {
        name,
        description,
        inputSchema: mcpToolInputSchema,
        parameters: normalizeInputSchema(tool.inputSchema),
        formatPolicy: {
          maxModelChars: 6000,
          mode: "json",
        },
        execute(input, context) {
          return executeMcpTool({
            server: options.server,
            rawToolName: tool.name,
            adaptedToolName: name,
            input,
            clientManager: options.clientManager,
            humanInteractionManager: options.humanInteractionManager,
            signal: context.signal,
          });
        },
      },
    });
  }

  return adapted;
}

async function executeMcpTool(input: {
  server: McpServerConfig;
  rawToolName: string;
  adaptedToolName: string;
  input: JsonObject;
  clientManager: Pick<McpClientManager, "callTool">;
  humanInteractionManager?: HumanInteractionManager;
  signal: AbortSignal;
}): Promise<ToolResult> {
  if (input.server.approval === "reject") {
    return createToolFailure(
      "permission",
      `MCP server '${input.server.name}' is rejected by approval policy`,
      { mcp: { serverName: input.server.name, toolName: input.rawToolName } },
    );
  }

  if (input.server.approval === "ask") {
    if (!input.humanInteractionManager) {
      return createToolFailure(
        "permission",
        `MCP tool '${input.adaptedToolName}' requires approval, but no approval manager is configured`,
        { mcp: { serverName: input.server.name, toolName: input.rawToolName } },
      );
    }
    const approved = await input.humanInteractionManager.requestApproval({
      title: `Approve MCP ${input.server.name}/${input.rawToolName}`,
      body: JSON.stringify(input.input, null, 2),
    }, input.signal);
    if (!approved) {
      return createToolFailure(
        "permission",
        `User denied MCP tool '${input.adaptedToolName}'`,
        { mcp: { serverName: input.server.name, toolName: input.rawToolName } },
      );
    }
  }

  try {
    const result = await input.clientManager.callTool(
      input.server.name,
      input.rawToolName,
      input.input,
      input.signal,
    );
    return normalizeMcpToolResult({
      serverName: input.server.name,
      toolName: input.rawToolName,
      result,
    });
  } catch (error) {
    return mcpErrorToToolResult(error, input.server.name, input.rawToolName);
  }
}

function normalizeInputSchema(value: JsonObject): JsonObject {
  if (isJsonObject(value) && value.type === "object") {
    return value;
  }
  return {
    type: "object",
    properties: {},
    required: [],
  };
}
