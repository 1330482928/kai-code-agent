import type { JsonValue } from "../foundation/tool.js";
import { isReadonlyBashCommand } from "../coding/plan/readonly-bash.js";
import type {
  ApprovalRememberScope,
  PermissionAction,
  PermissionDecision,
  PermissionEngineOptions,
  PermissionProfileName,
  PermissionSettings,
  PermissionEvaluationContext,
} from "./types.js";
import { parseMcpToolName } from "../mcp/format.js";

const READ_TOOLS = new Set(["read_file", "grep", "glob", "ask_user_question"]);
const WRITE_TOOLS = new Set(["write_file", "edit_file", "apply_patch"]);
const PLAN_TOOLS = new Set(["plan_enter", "plan_write", "plan_exit"]);

export class PermissionEngine {
  constructor(private readonly options: PermissionEngineOptions) {}

  evaluate(context: PermissionEvaluationContext): PermissionDecision {
    const action = classifyAction(context.toolName, context.input, this.options.agentProfile, context.cwd ?? this.options.cwd);
    if (READ_TOOLS.has(action.toolName)) {
      return { type: "auto", reason: "readonly tool" };
    }

    if (this.options.agentProfile === "plan") {
      return this.evaluatePlan(action);
    }

    const rememberKey = rememberKeyFor(action);

    if (this.options.permissionProfile.name === "dangerFullAccess") {
      return { type: "auto", reason: "dangerFullAccess permission profile" };
    }

    if (action.kind === "file") {
      if (this.options.permissionProfile.name === "workspaceWrite") {
        return { type: "auto", reason: "workspaceWrite allows file mutation within workspace" };
      }
      return reject(action, "readOnly permission profile does not allow file mutation");
    }

    if (action.kind === "patch") {
      if (this.options.permissionProfile.name === "workspaceWrite") {
        return { type: "auto", reason: "workspaceWrite allows patch application within workspace" };
      }
      return reject(action, "readOnly permission profile does not allow patch application");
    }

    if (action.kind === "bash") {
      const command = stringValue(action.input, "command");
      if (isReadonlyBashCommand(command)) {
        return { type: "auto", reason: "readonly bash command" };
      }
      const remembered = this.findRememberedApproval(rememberKey);
      if (remembered) {
        return { type: "auto", reason: `remembered approval (${remembered})` };
      }
      if (this.options.permissionProfile.name === "workspaceWrite") {
        return ask(action, rememberKey, "Non-readonly bash requires approval");
      }
      return reject(action, "readOnly permission profile does not allow non-readonly bash");
    }

    if (action.kind === "mcp") {
      const serverName = parseMcpToolName(action.toolName)?.serverName;
      const mcpApproval = serverName ? this.options.settings?.mcpServers?.[serverName]?.approval : undefined;
      if (mcpApproval === "allow") {
        return { type: "auto", reason: "allowed MCP server" };
      }
      if (mcpApproval === "reject") {
        return reject(action, "MCP server is rejected by settings");
      }
      const remembered = this.findRememberedApproval(rememberKey);
      if (remembered) {
        return { type: "auto", reason: `remembered approval (${remembered})` };
      }
      if (this.options.permissionProfile.name === "workspaceWrite") {
        return ask(action, rememberKey, "MCP tools require approval");
      }
      return reject(action, "readOnly permission profile does not allow MCP tools");
    }

    if (action.kind === "sub_agent") {
      const remembered = this.findRememberedApproval(rememberKey);
      if (remembered) {
        return { type: "auto", reason: `remembered approval (${remembered})` };
      }
      if (this.options.permissionProfile.name === "workspaceWrite") {
        return ask(action, rememberKey, "Sub-agent runs require approval");
      }
      return reject(action, "readOnly permission profile does not allow sub-agents");
    }

    return { type: "auto", reason: "default allow" };
  }

  shouldRememberApproval(): boolean {
    return this.options.permissionProfile.rememberApprovals;
  }

  rememberScope(settings?: PermissionSettings): ApprovalRememberScope | undefined {
    return settings?.permissions?.rememberScope;
  }

  private evaluatePlan(action: PermissionAction): PermissionDecision {
    if (action.kind === "file" || action.kind === "patch") {
      return reject(action, "plan profile does not allow workspace mutations");
    }

    if (action.kind === "bash") {
      const command = stringValue(action.input, "command");
      if (isReadonlyBashCommand(command)) {
        return { type: "auto", reason: "readonly bash command in plan mode" };
      }
      return reject(action, "plan profile allows only readonly bash commands");
    }

    if (action.kind === "mcp" || action.kind === "sub_agent") {
      return reject(action, `plan profile does not allow ${action.kind} tools`);
    }

    return { type: "auto", reason: "plan profile read-only tool" };
  }

  private findRememberedApproval(rememberKey: string): string | undefined {
    const remembered = this.options.settings?.permissions?.rememberedApprovals?.[rememberKey];
    if (!remembered) {
      return undefined;
    }
    return remembered.reason;
  }
}

export function createPermissionEngine(options: PermissionEngineOptions): PermissionEngine {
  return new PermissionEngine(options);
}

export function classifyAction(
  toolName: string,
  input: JsonValue,
  agentProfile: PermissionProfileName | string,
  cwd = process.cwd(),
): PermissionAction {
  const kind = classifyKind(toolName, input);
  return {
    toolName,
    kind,
    cwd,
    input,
    agentProfile: agentProfile === "plan" ? "plan" : "build",
  };
}

export function classifyKind(toolName: string, input: JsonValue): PermissionAction["kind"] {
  if (WRITE_TOOLS.has(toolName)) {
    return toolName === "apply_patch" ? "patch" : "file";
  }
  if (toolName === "bash") {
    return "bash";
  }
  if (toolName.startsWith("mcp__")) {
    return "mcp";
  }
  if (toolName === "sub_agent") {
    return "sub_agent";
  }
  if (PLAN_TOOLS.has(toolName)) {
    return "plan";
  }
  return "file";
}

export function rememberKeyFor(action: PermissionAction): string {
  return `${action.agentProfile}:${action.kind}:${action.toolName}:${action.cwd}:${stableJson(action.input)}`;
}

export function buildAskDecision(action: PermissionAction, rememberKey: string, reason: string): PermissionDecision {
  return ask(action, rememberKey, reason);
}

function ask(action: PermissionAction, rememberKey: string, reason: string): PermissionDecision {
  return {
    type: "ask",
    reason,
    prompt: `${reason}\n\n${action.toolName}\n${stableJson(action.input)}`,
    rememberKey,
  };
}

function reject(action: PermissionAction, reason: string): PermissionDecision {
  return { type: "reject", reason };
}

function stringValue(input: JsonValue, key: string): string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return "";
  }
  const value = (input as Record<string, JsonValue>)[key];
  return typeof value === "string" ? value : "";
}

function stableJson(value: JsonValue): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const entries = Object.entries(value as Record<string, JsonValue>).sort(([a], [b]) => a.localeCompare(b));
  return entries.reduce<Record<string, JsonValue>>((acc, [key, entry]) => {
    acc[key] = sortJson(entry);
    return acc;
  }, {});
}
