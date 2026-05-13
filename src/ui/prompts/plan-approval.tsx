import type { PromptIO } from "../../config/first-run.js";
import type { PlanApprovalRequest } from "../../agent/human-interaction-manager.js";

export async function promptPlainPlanApproval(prompt: PromptIO, request: PlanApprovalRequest): Promise<boolean> {
  const answer = (await prompt.question([
    "Plan approval requested.",
    `Plan: ${request.planPath}`,
    request.planBody,
    "Approve plan? [y/N]: ",
  ].join("\n"))).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}
