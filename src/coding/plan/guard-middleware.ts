import { createToolFailure, type ToolResult } from "../../foundation/tool.js";
import type { AgentMiddleware } from "../../agent/middleware.js";
import type { AgentProfileName } from "../../agent/profiles.js";

import { isReadonlyBashCommand } from "./readonly-bash.js";

const PLAN_ALLOWED_TOOLS = new Set([
  "read_file",
  "bash",
  "ask_user_question",
  "plan_enter",
  "plan_write",
  "plan_exit",
]);

export interface PlanGuardOptions {
  getProfile(): AgentProfileName;
}

export function createPlanGuardMiddleware(options: PlanGuardOptions): AgentMiddleware {
  return {
    name: "plan-guard",
    beforeToolUse(context): ToolResult | undefined {
      if (options.getProfile() !== "plan") {
        return undefined;
      }

      if (!PLAN_ALLOWED_TOOLS.has(context.toolUse.name)) {
        return createToolFailure(
          "permission",
          `Tool '${context.toolUse.name}' is not allowed in plan mode`,
          { profile: "plan", toolName: context.toolUse.name },
        );
      }

      if (context.toolUse.name === "bash") {
        const command = typeof context.toolUse.input.command === "string" ? context.toolUse.input.command : "";
        if (!isReadonlyBashCommand(command)) {
          return createToolFailure(
            "permission",
            "Only readonly bash commands are allowed in plan mode",
            { profile: "plan", command },
          );
        }
      }

      return undefined;
    },
  };
}
