import { z } from "zod";

import type { HumanInteractionManager } from "../../agent/human-interaction-manager.js";
import { createToolFailure, type JsonObject, type ToolDef, type ToolResult } from "../../foundation/tool.js";
import type { UiEvent } from "../../foundation/ui-event.js";
import type { AgentProfileName } from "../../agent/profiles.js";

import { boundPlanPreview, PlanStore } from "./store.js";

export interface PlanToolRuntime {
  store: PlanStore;
  humanInteractionManager?: HumanInteractionManager;
  getProfile?: () => AgentProfileName;
  autoApprovePlan?: boolean;
  onUiEvent?: (event: UiEvent) => void | Promise<void>;
}

const planEnterInputSchema = z.object({}).passthrough();

const planWriteInputSchema = z.object({
  content: z.string().min(1),
  slug: z.string().optional(),
});

const planExitInputSchema = z.object({}).passthrough();

export type PlanEnterInput = z.infer<typeof planEnterInputSchema>;
export type PlanWriteInput = z.infer<typeof planWriteInputSchema>;
export type PlanExitInput = z.infer<typeof planExitInputSchema>;

export function createPlanTools(runtime: PlanToolRuntime): ToolDef[] {
  return [
    createPlanEnterTool(runtime),
    createPlanWriteTool(runtime),
    createPlanExitTool(runtime),
  ];
}

export function createPlanEnterTool(runtime: PlanToolRuntime): ToolDef<typeof planEnterInputSchema> {
  return {
    name: "plan_enter",
    description: "Enter plan mode before making workspace changes.",
    inputSchema: planEnterInputSchema,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async execute(_input, context): Promise<ToolResult> {
      const profile = runtime.getProfile?.() ?? "build";
      const plan = await runtime.store.ensurePlan(context.sessionId, "plan");
      return {
        ok: true,
        output: profile === "plan"
          ? `Already in plan mode. Active plan: ${plan.path}`
          : `Entering plan mode. Active plan: ${plan.path}`,
        metadata: {
          plan: {
            status: "entered",
            planPath: plan.path,
            nextProfile: "plan",
            currentProfile: profile,
          },
          planPath: plan.path,
          nextProfile: "plan",
        },
      };
    },
  };
}

export function createPlanWriteTool(runtime: PlanToolRuntime): ToolDef<typeof planWriteInputSchema> {
  return {
    name: "plan_write",
    description: "Write the current implementation plan Markdown to the active plan file.",
    inputSchema: planWriteInputSchema,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        content: { type: "string", description: "Markdown plan content." },
        slug: { type: "string", description: "Optional short filename slug." },
      },
      required: ["content"],
    },
    async execute(input, context): Promise<ToolResult> {
      const written = await runtime.store.writePlan({
        sessionId: context.sessionId,
        content: input.content,
        slugSource: input.slug ?? input.content,
      });
      return {
        ok: true,
        output: `Plan written: ${written.path}`,
        metadata: {
          plan: {
            status: "updated",
            planPath: written.path,
            preview: written.preview,
            bytes: written.bytes,
            nextProfile: "plan",
          },
          planPath: written.path,
          bytes: written.bytes,
          nextProfile: "plan",
        },
      };
    },
  };
}

export function createPlanExitTool(runtime: PlanToolRuntime): ToolDef<typeof planExitInputSchema> {
  return {
    name: "plan_exit",
    description: "Request human approval for the active plan and return to build mode if approved.",
    inputSchema: planExitInputSchema,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async execute(_input, context): Promise<ToolResult> {
      const plan = await runtime.store.readPlan(context.sessionId);
      if (plan.content.trim().length === 0) {
        return createToolFailure("validation", "Cannot exit plan mode before writing a non-empty plan", {
          planPath: plan.path,
        });
      }

      const planBody = boundPlanPreview(plan.content);
      await runtime.onUiEvent?.({
        type: "plan_approval_request",
        id: `plan_${context.toolCallId}`,
        planPath: plan.path,
        planBody,
      });

      let approved: boolean;
      if (runtime.autoApprovePlan) {
        approved = true;
      } else if (runtime.humanInteractionManager) {
        approved = await runtime.humanInteractionManager.requestPlanApproval({
          sessionId: context.sessionId,
          planPath: plan.path,
          planBody,
          profile: runtime.getProfile?.() ?? "plan",
        }, context.signal);
      } else {
        return createToolFailure("permission", "Plan approval requires an interactive approval subscriber", {
          planPath: plan.path,
        });
      }

      const metadata: JsonObject = {
        plan: {
          status: approved ? "approved" : "rejected",
          planPath: plan.path,
          preview: planBody,
          approvedPlan: approved ? plan.content : "",
          nextProfile: approved ? "build" : "plan",
        },
        planPath: plan.path,
        approved,
        nextProfile: approved ? "build" : "plan",
      };
      return {
        ok: true,
        output: approved
          ? `Plan approved: ${plan.path}`
          : `Plan rejected: ${plan.path}. Revise the plan before building.`,
        metadata,
      };
    },
  };
}

export {
  planEnterInputSchema,
  planWriteInputSchema,
  planExitInputSchema,
};
