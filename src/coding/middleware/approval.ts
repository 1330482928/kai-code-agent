import { createToolFailure, type ToolResult } from "../../foundation/tool.js";
import type { AgentMiddleware } from "../../agent/middleware.js";
import type { HumanInteractionManager } from "../../agent/human-interaction-manager.js";

const DEFAULT_MUTATING_TOOLS = new Set(["bash", "write_file", "edit_file"]);

export interface ApprovalMiddlewareOptions {
  manager?: HumanInteractionManager;
  requireApprovalFor?: Set<string>;
}

export function createApprovalMiddleware(options: ApprovalMiddlewareOptions = {}): AgentMiddleware {
  const mutatingTools = options.requireApprovalFor ?? DEFAULT_MUTATING_TOOLS;
  return {
    name: "approval",
    async beforeToolUse(context): Promise<ToolResult | undefined> {
      if (!mutatingTools.has(context.toolUse.name)) {
        return undefined;
      }
      if (!options.manager) {
        return createToolFailure("permission", `Tool '${context.toolUse.name}' requires approval, but no approval manager is configured`);
      }
      const approved = await options.manager.requestApproval({
        title: `Approve ${context.toolUse.name}`,
        body: JSON.stringify(context.toolUse.input, null, 2),
      }, context.signal);
      if (approved) {
        return undefined;
      }
      return createToolFailure("permission", `User denied tool '${context.toolUse.name}'`);
    },
  };
}
