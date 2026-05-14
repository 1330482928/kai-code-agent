import type { PermissionAuditRecord, PermissionDecision, PermissionAction } from "./types.js";

export function buildPermissionAuditRecord(input: {
  sessionId: string;
  action: PermissionAction;
  decision: PermissionDecision;
  rememberScope?: "session" | "projectLocal" | "user";
}): PermissionAuditRecord {
  return {
    sessionId: input.sessionId,
    action: input.action,
    decision: input.decision.type,
    reason: input.decision.reason,
    ...(input.decision.type === "ask" && input.decision.rememberKey ? { rememberKey: input.decision.rememberKey } : {}),
    ...(input.rememberScope ? { rememberScope: input.rememberScope } : {}),
    createdAt: new Date().toISOString(),
  };
}

