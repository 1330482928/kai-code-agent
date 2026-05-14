import type { JsonValue } from "../foundation/tool.js";
import type { AgentProfileName } from "../agent/profiles.js";

export type PermissionProfileName = "readOnly" | "workspaceWrite" | "dangerFullAccess";
export type ApprovalRememberScope = "session" | "projectLocal" | "user";
export type PermissionActionKind = "file" | "bash" | "patch" | "mcp" | "sub_agent" | "plan";

export type PermissionDecision =
  | { type: "auto"; reason: string }
  | { type: "ask"; reason: string; prompt: string; rememberKey?: string }
  | { type: "reject"; reason: string };

export interface PermissionProfile {
  name: PermissionProfileName;
  rememberApprovals: boolean;
}

export interface PermissionAction {
  toolName: string;
  kind: PermissionActionKind;
  cwd: string;
  input: JsonValue;
  agentProfile: AgentProfileName;
}

export interface RememberedApproval {
  reason: string;
  createdAt: string;
}

export interface PermissionSettings {
  permissions?: {
    rememberScope?: ApprovalRememberScope;
    rememberedApprovals?: Record<string, RememberedApproval>;
    allow?: string[];
    deny?: string[];
  };
  mcpServers?: Record<string, {
    approval?: "allow" | "ask" | "reject";
    enabled?: boolean;
  }>;
  tools?: {
    bash?: {
      allowCommands?: string[];
      denyCommands?: string[];
    };
  };
  mcp?: {
    allowedServers?: string[];
    deniedServers?: string[];
  };
  defaultPermissionProfile?: PermissionProfileName;
}

export interface PermissionAuditRecord {
  sessionId: string;
  action: PermissionAction;
  decision: PermissionDecision["type"];
  reason: string;
  rememberScope?: ApprovalRememberScope;
  rememberKey?: string;
  createdAt: string;
}

export interface PermissionEngineOptions {
  cwd: string;
  sessionId: string;
  agentProfile: AgentProfileName;
  permissionProfile: PermissionProfile;
  settings?: PermissionSettings;
}

export interface PermissionEvaluationContext {
  toolName: string;
  input: JsonValue;
  cwd?: string;
}

export function isPermissionSettings(value: unknown): value is PermissionSettings {
  return typeof value === "object" && value !== null;
}
