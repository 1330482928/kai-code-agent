import type { ContextCutReason } from "../items.js";
import type { PromptDebugSnapshot } from "../debug.js";

export interface ContextDebugDiff {
  itemOrderChanged: boolean;
  cutReasonChanges: Array<{ id: string; before?: ContextCutReason; after?: ContextCutReason }>;
  tokenDelta: number;
  preview: string;
}

export function diffContextDebugSnapshots(before: PromptDebugSnapshot, after: PromptDebugSnapshot): ContextDebugDiff {
  const beforeIds = before.items.map((item) => item.id);
  const afterIds = after.items.map((item) => item.id);
  const itemOrderChanged = beforeIds.join("|") !== afterIds.join("|");
  const cutReasonChanges: ContextDebugDiff["cutReasonChanges"] = [];
  for (const item of after.items) {
    const prior = before.items.find((candidate) => candidate.id === item.id);
    const beforeCut = prior?.cutReason;
    const afterCut = item.cutReason;
    if (beforeCut !== afterCut) {
      cutReasonChanges.push({ id: item.id, before: beforeCut, after: afterCut });
    }
  }
  const beforeTokens = before.budgetPlan?.estimatedInputTokens ?? before.provider.messages.reduce((sum, message) => sum + message.tokens, 0);
  const afterTokens = after.budgetPlan?.estimatedInputTokens ?? after.provider.messages.reduce((sum, message) => sum + message.tokens, 0);
  return {
    itemOrderChanged,
    cutReasonChanges,
    tokenDelta: afterTokens - beforeTokens,
    preview: renderContextDebugDiff({
      itemOrderChanged,
      cutReasonChanges,
      tokenDelta: afterTokens - beforeTokens,
      preview: "",
    }),
  };
}

export function renderContextDebugDiff(diff: ContextDebugDiff): string {
  const lines = [
    "Context Debug Diff",
    `Item order changed: ${diff.itemOrderChanged ? "yes" : "no"}`,
    `Token delta: ${diff.tokenDelta}`,
  ];
  if (diff.cutReasonChanges.length > 0) {
    lines.push("Cut reason changes:");
    for (const change of diff.cutReasonChanges) {
      lines.push(`- ${change.id}: ${change.before ?? "included"} -> ${change.after ?? "included"}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function snapshotFromTrace(input: {
  items: PromptDebugSnapshot["items"];
  modelInputDigest: {
    estimatedInputTokens: number;
    reservedOutputTokens: number;
    messageCount: number;
    toolCount: number;
  };
  budget?: {
    maxInputTokens: number;
    reservedOutputTokens: number;
    usableInputTokens: number;
    compactThreshold: number;
    compactTriggerTokens: number;
    estimatedInputTokens: number;
    estimatedToolTokens: number;
    estimatedTotalTokens: number;
    shouldCompact: boolean;
    overBudget: boolean;
  };
}): PromptDebugSnapshot {
  return {
    budget: input.budget ?? {
      maxInputTokens: input.modelInputDigest.estimatedInputTokens + input.modelInputDigest.reservedOutputTokens,
      reservedOutputTokens: input.modelInputDigest.reservedOutputTokens,
      usableInputTokens: input.modelInputDigest.estimatedInputTokens,
      compactThreshold: 1,
      compactTriggerTokens: input.modelInputDigest.estimatedInputTokens,
      estimatedInputTokens: input.modelInputDigest.estimatedInputTokens,
      estimatedToolTokens: input.modelInputDigest.toolCount,
      estimatedTotalTokens: input.modelInputDigest.estimatedInputTokens,
      shouldCompact: false,
      overBudget: false,
    },
    items: input.items,
    provider: {
      model: "context-trace",
      messageCount: input.modelInputDigest.messageCount,
      messages: [],
      tools: [],
    },
  };
}
