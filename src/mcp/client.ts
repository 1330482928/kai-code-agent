import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

import type { JsonObject } from "../foundation/tool.js";
import type { McpServerConfig } from "./config.js";
import { McpClientError, mcpErrorMessage } from "./errors.js";

export type McpSdkClient = Client;

export interface McpClientManagerOptions {
  servers: McpServerConfig[];
  cwd?: string;
  clientInfo?: {
    name: string;
    version: string;
  };
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: JsonObject;
}

interface ConnectedMcpServer {
  config: McpServerConfig;
  client: Client;
}

export class McpClientManager {
  private readonly servers = new Map<string, McpServerConfig>();
  private readonly clients = new Map<string, Promise<ConnectedMcpServer>>();
  private readonly cwd: string;
  private readonly clientInfo: { name: string; version: string };

  constructor(options: McpClientManagerOptions) {
    this.cwd = options.cwd ?? process.cwd();
    this.clientInfo = options.clientInfo ?? { name: "kai-code-agent", version: "0.0.0" };
    for (const server of options.servers) {
      this.servers.set(server.name, server);
    }
  }

  getServer(name: string): McpServerConfig | undefined {
    return this.servers.get(name);
  }

  listServers(): McpServerConfig[] {
    return [...this.servers.values()];
  }

  async listTools(serverName: string, signal?: AbortSignal): Promise<McpToolDefinition[]> {
    try {
      const connected = await this.connect(serverName);
      if (signal?.aborted) {
        throw new DOMException("Operation was aborted", "AbortError");
      }
      const result = await connected.client.listTools(undefined, { signal });
      return result.tools.map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: tool.inputSchema as JsonObject,
      }));
    } catch (error) {
      throw this.wrapError(serverName, "list", error);
    }
  }

  async callTool(
    serverName: string,
    toolName: string,
    input: JsonObject,
    signal?: AbortSignal,
  ): Promise<unknown> {
    try {
      const connected = await this.connect(serverName);
      if (signal?.aborted) {
        throw new DOMException("Operation was aborted", "AbortError");
      }
      return await connected.client.callTool({ name: toolName, arguments: input }, undefined, { signal });
    } catch (error) {
      throw this.wrapError(serverName, "call", error);
    }
  }

  async closeAll(): Promise<void> {
    const connected = await Promise.allSettled(this.clients.values());
    this.clients.clear();
    const errors: Error[] = [];
    for (const result of connected) {
      if (result.status === "fulfilled") {
        try {
          await result.value.client.close();
        } catch (error) {
          errors.push(this.wrapError(result.value.config.name, "close", error));
        }
      }
    }
    if (errors.length > 0) {
      throw errors[0];
    }
  }

  private connect(serverName: string): Promise<ConnectedMcpServer> {
    const existing = this.clients.get(serverName);
    if (existing) {
      return existing;
    }

    const created = this.open(serverName);
    this.clients.set(serverName, created);
    return created;
  }

  private async open(serverName: string): Promise<ConnectedMcpServer> {
    const config = this.servers.get(serverName);
    if (!config) {
      throw new McpClientError(serverName, "config", "server is not configured");
    }

    try {
      const client = new Client(this.clientInfo, { capabilities: {} });
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        cwd: resolveMcpCwd(config, this.cwd),
        env: Object.keys(config.env).length === 0 ? undefined : {
          ...getDefaultEnvironment(),
          ...config.env,
        },
        stderr: "pipe",
      });
      await client.connect(transport);
      return { config, client };
    } catch (error) {
      this.clients.delete(serverName);
      throw this.wrapError(serverName, "connection", error);
    }
  }

  private wrapError(serverName: string, operation: "config" | "connection" | "list" | "call" | "close", error: unknown): McpClientError {
    if (error instanceof McpClientError) {
      return error;
    }
    return new McpClientError(serverName, operation, mcpErrorMessage(error), error);
  }
}

function resolveMcpCwd(config: McpServerConfig, fallbackCwd: string): string {
  if (!config.cwd) {
    return fallbackCwd;
  }
  return path.isAbsolute(config.cwd) ? config.cwd : path.resolve(fallbackCwd, config.cwd);
}
