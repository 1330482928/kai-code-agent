import { z } from "zod";

import type { JsonObject } from "../foundation/tool.js";
import { redactSecret } from "../ui/secrets.js";
import { loadRuntimeSettings, type RuntimeSettingsPathOptions } from "../config/settings.js";

export const mcpApprovalPolicySchema = z.enum(["allow", "ask", "reject"]);

export type McpApprovalPolicy = z.infer<typeof mcpApprovalPolicySchema>;

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  approval: McpApprovalPolicy;
  enabled: boolean;
  cwd?: string;
}

export interface McpConfigError {
  serverName: string;
  message: string;
}

export interface LoadMcpConfigResult {
  servers: McpServerConfig[];
  errors: McpConfigError[];
  loadedPaths: string[];
}

export interface McpConfigPathOptions extends RuntimeSettingsPathOptions {}

const rawMcpServerConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string()).optional().default({}),
  approval: mcpApprovalPolicySchema.optional().default("ask"),
  enabled: z.boolean().optional().default(true),
  cwd: z.string().min(1).optional(),
});

export async function loadMcpConfig(options: McpConfigPathOptions = {}): Promise<LoadMcpConfigResult> {
  const loaded = await loadRuntimeSettings(options);
  return parseMcpConfig(loaded.settings, loaded.loadedPaths);
}

export function parseMcpConfig(settings: JsonObject, loadedPaths: string[] = []): LoadMcpConfigResult {
  const rawServers = settings.mcpServers;
  if (!isJsonObject(rawServers)) {
    return { servers: [], errors: [], loadedPaths };
  }

  const servers: McpServerConfig[] = [];
  const errors: McpConfigError[] = [];

  for (const [serverName, rawConfig] of Object.entries(rawServers)) {
    if (!serverName.trim()) {
      errors.push({ serverName: "<empty>", message: "MCP server name must be non-empty" });
      continue;
    }

    const parsed = rawMcpServerConfigSchema.safeParse(rawConfig);
    if (!parsed.success) {
      errors.push({
        serverName,
        message: `Invalid MCP server '${serverName}': ${summarizeZodIssues(parsed.error)}`,
      });
      continue;
    }

    if (!parsed.data.enabled) {
      continue;
    }

    servers.push({
      name: serverName,
      command: parsed.data.command,
      args: parsed.data.args,
      env: parsed.data.env,
      approval: parsed.data.approval,
      enabled: parsed.data.enabled,
      ...(parsed.data.cwd ? { cwd: parsed.data.cwd } : {}),
    });
  }

  return { servers, errors, loadedPaths };
}

export function redactMcpServerConfig(config: McpServerConfig): McpServerConfig {
  return {
    ...config,
    env: Object.fromEntries(Object.entries(config.env).map(([key, value]) => [key, redactSecret(value)])),
  };
}

export function redactMcpText(text: string, configs: McpServerConfig[]): string {
  let redacted = text;
  for (const config of configs) {
    for (const value of Object.values(config.env)) {
      if (value) {
        redacted = redacted.split(value).join(redactSecret(value));
      }
    }
  }
  return redacted;
}

function summarizeZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
