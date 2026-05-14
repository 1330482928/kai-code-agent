import type { LoadedSession } from "../../../session/types.js";
import { buildPromptDebugSnapshot, buildContextItemsForRun, ContextManager, type ContextAssemblyOptions, type ContextItem, type PromptDebugSnapshot } from "../index.js";
import type { AgentProfileName } from "../../../agent/profiles.js";
import { redactContextTraceValue } from "./redact.js";
import { currentUserOrdinalFromMessages, loadedSessionToMessages } from "./session.js";
import type { ContextQualityTrace } from "./types.js";

export interface ExportContextTraceInput {
  loadedSession: LoadedSession;
  cwd: string;
  model: string;
  profileName?: AgentProfileName;
  taskKind?: ContextQualityTrace["taskKind"];
  turnId?: string;
  contextOptions?: ContextAssemblyOptions;
  extraItems?: ContextItem[];
}

export interface BuildContextQualityArtifactsResult {
  trace: ContextQualityTrace;
  snapshot: PromptDebugSnapshot;
}

export async function exportContextTrace(input: ExportContextTraceInput): Promise<ContextQualityTrace> {
  const artifacts = await buildContextQualityArtifacts(input);
  return artifacts.trace;
}

export async function buildContextQualityArtifacts(input: ExportContextTraceInput): Promise<BuildContextQualityArtifactsResult> {
  const messages = loadedSessionToMessages(input.loadedSession);
  const builtItems = await buildContextItemsForRun({
    cwd: input.cwd,
    messages,
    loadedSession: input.loadedSession,
    profileName: input.profileName ?? "build",
    currentUserOrdinal: currentUserOrdinalFromMessages(messages),
    contextOptions: input.contextOptions,
    extraItems: input.extraItems,
  });
  const build = await new ContextManager({ readOnly: true }).build({
    model: input.model,
    items: builtItems,
  });
  const snapshot = buildPromptDebugSnapshot({ build, showItems: true });
  const budget = snapshot.budgetPlan ?? build.debug.budgetPlan;
  if (!budget) {
    throw new Error("Context quality trace export requires a resolved budget plan");
  }
  const trace = redactContextTraceValue({
    sessionId: input.loadedSession.session.id,
    turnId: input.turnId ?? input.loadedSession.session.id,
    createdAt: new Date().toISOString(),
    taskKind: input.taskKind ?? "mixed",
    items: snapshot.items,
    budget,
    ...(snapshot.compaction ? {
      compaction: {
        decision: snapshot.compaction.decision,
        ...(snapshot.compaction.reason ? { reason: snapshot.compaction.reason } : {}),
        compactedItemIds: snapshot.compaction.compactedItemIds,
        preservedItemIds: snapshot.compaction.preservedItemIds,
        ...(snapshot.compaction.summaryItemId ? { summaryItemId: snapshot.compaction.summaryItemId } : {}),
      },
    } : {}),
    modelInputDigest: {
      systemHash: hashStrings(snapshot.provider.messages.map((message) => message.preview ?? message.role).join("\n")),
      messageCount: snapshot.provider.messageCount,
      toolCount: snapshot.provider.tools.length,
      estimatedInputTokens: snapshot.budgetPlan?.estimatedInputTokens ?? build.debug.estimatedInputTokens,
      reservedOutputTokens: snapshot.budget.reservedOutputTokens,
    },
    outcome: {
      completed: true,
      userCorrectionCount: countMessages(messages, "user"),
      retryCount: 0,
      compactionCount: snapshot.compaction?.decision === "compacted" ? 1 : 0,
    },
  });
  return { trace, snapshot };
}

export function buildContextTraceSnapshot(input: {
  trace: ContextQualityTrace;
  redact?: boolean;
}): ContextQualityTrace {
  return input.redact === false ? input.trace : redactContextTraceValue(input.trace);
}

export function renderContextTrace(trace: ContextQualityTrace): string {
  return `${JSON.stringify(trace, null, 2)}\n`;
}

export function renderContextQualityTrace(trace: ContextQualityTrace): string {
  return renderContextTrace(trace);
}

function hashStrings(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return `h${Math.abs(hash).toString(16)}`;
}

function countMessages(messages: Array<{ role: string }>, role: string): number {
  return messages.filter((message) => message.role === role).length;
}
