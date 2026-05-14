import { createToolFailure, type ToolResult } from "../foundation/tool.js";
import type { JsonObject, JsonValue } from "../foundation/tool.js";
import type { AgentMiddleware } from "../agent/middleware.js";
import type { HumanInteractionManager } from "../agent/human-interaction-manager.js";
import type { SessionRecorder } from "../session/types.js";
import { loadSettingsLayers, saveSettingsScope } from "../config/settings.js";
import { buildPermissionAuditRecord } from "./audit.js";
import { createPermissionEngine, classifyAction } from "./engine.js";
import type { PermissionProfile, PermissionProfileName, PermissionSettings } from "./types.js";

export interface PermissionMiddlewareOptions {
  cwd: string;
  sessionId: string;
  agentProfile: "build" | "plan";
  permissionProfile?: PermissionProfileName;
  homeDir?: string;
  manager?: HumanInteractionManager;
  sessionRecorder?: SessionRecorder;
}

export function createPermissionMiddleware(options: PermissionMiddlewareOptions): AgentMiddleware {
  let cachedSettings: PermissionSettings | undefined;
  let cachedPermissionProfile: PermissionProfile | undefined;

  async function load(): Promise<void> {
    if (cachedSettings && cachedPermissionProfile) {
      return;
    }
    const loaded = await loadSettingsLayers({ cwd: options.cwd, homeDir: options.homeDir });
    cachedSettings = loaded.settings as PermissionSettings;
    const permissionProfile = options.permissionProfile
      ?? cachedSettings.defaultPermissionProfile
      ?? (options.agentProfile === "plan" ? "readOnly" : "workspaceWrite");
    cachedPermissionProfile = {
      name: permissionProfile,
      rememberApprovals: permissionProfile !== "readOnly",
    };
  }

  return {
    name: "permission",
    async beforeToolUse(context): Promise<ToolResult | undefined> {
      await load();
      const settings = cachedSettings!;
      const permissionProfile = cachedPermissionProfile!;
      const engine = createPermissionEngine({
        cwd: options.cwd,
        sessionId: options.sessionId,
        agentProfile: options.agentProfile,
        permissionProfile,
        settings,
      });
      const action = classifyAction(context.toolUse.name, context.toolUse.input as JsonValue, options.agentProfile, options.cwd);
      const decision = engine.evaluate({
        toolName: context.toolUse.name,
        input: context.toolUse.input as JsonValue,
        cwd: options.cwd,
      });
      const rememberScope = settings.permissions?.rememberScope;
      await options.sessionRecorder?.recordPermissionAudit?.(
        buildPermissionAuditRecord({
          sessionId: options.sessionId,
          action,
          decision,
          ...(rememberScope ? { rememberScope } : {}),
        }),
      );

      if (decision.type === "auto") {
        return undefined;
      }

      if (decision.type === "reject") {
        return createToolFailure("permission", decision.reason, {
          permission: {
            toolName: context.toolUse.name,
            decision: "reject",
            reason: decision.reason,
          },
        });
      }

      if (!options.manager) {
        return createToolFailure("permission", `Tool '${context.toolUse.name}' requires approval, but no approval manager is configured`, {
          permission: {
            toolName: context.toolUse.name,
            decision: "ask",
            reason: decision.reason,
          },
        });
      }

      const approved = await options.manager.requestApproval({
        title: `Approve ${context.toolUse.name}`,
        body: `${decision.reason}\n\n${JSON.stringify(context.toolUse.input, null, 2)}`,
      }, context.signal);
      if (!approved) {
        return createToolFailure("permission", `User denied tool '${context.toolUse.name}'`, {
          permission: {
            toolName: context.toolUse.name,
            decision: "ask",
            reason: decision.reason,
          },
        });
      }

      if (permissionProfile.rememberApprovals && rememberScope && decision.rememberKey) {
        const nextSettings = {
          ...settings,
          permissions: {
            ...(settings.permissions ?? {}),
            rememberedApprovals: {
              ...(settings.permissions?.rememberedApprovals ?? {}),
              [decision.rememberKey]: {
                reason: decision.reason,
                createdAt: new Date().toISOString(),
              },
            },
          },
        } satisfies PermissionSettings;
        cachedSettings = nextSettings;
        if (rememberScope !== "session") {
          await saveSettingsScope(rememberScope, nextSettings as JsonObject, { cwd: options.cwd, homeDir: options.homeDir });
        }
      }

      return undefined;
    },
  };
}
