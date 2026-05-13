import type { ProviderToolSchema } from "../../foundation/tool.js";

import {
  DEFAULT_CONTEXT_BUDGET,
  isContextItemIncluded,
  type ContextBudget,
  type ContextBudgetDebug,
  type ContextCutReason,
  type ContextItem,
  withEstimatedTokens,
} from "./items.js";
import { orderContextItems } from "./model-input-builder.js";
import { estimateContextItemTokens, estimateToolSchemaTokens } from "./tokens.js";

export interface ContextBudgetPlan {
  budget: ContextBudget;
  items: ContextItem[];
  debug: ContextBudgetDebug;
}

export interface PlanContextBudgetOptions {
  items: ContextItem[];
  tools?: ProviderToolSchema[];
  budget?: Partial<ContextBudget>;
}

export function resolveContextBudget(input: Partial<ContextBudget> = {}): ContextBudget {
  return {
    ...DEFAULT_CONTEXT_BUDGET,
    ...input,
    perKindMaxTokens: {
      ...DEFAULT_CONTEXT_BUDGET.perKindMaxTokens,
      ...input.perKindMaxTokens,
    },
  };
}

export function contextUsableInputTokens(budget: ContextBudget): number {
  return Math.max(0, budget.maxInputTokens - budget.reservedOutputTokens);
}

export function contextCompactTriggerTokens(budget: ContextBudget): number {
  const threshold = Math.max(0, Math.min(1, budget.compactThreshold));
  return Math.floor(contextUsableInputTokens(budget) * threshold);
}

export function planContextBudget(options: PlanContextBudgetOptions): ContextBudgetPlan {
  const budget = resolveContextBudget(options.budget);
  const usableInputTokens = contextUsableInputTokens(budget);
  const compactTriggerTokens = contextCompactTriggerTokens(budget);
  const toolTokens = estimateToolSchemaTokens(options.tools ?? []);
  const kindUsage = new Map<string, number>();
  let usedTokens = toolTokens;

  const original = orderContextItems(options.items).map((item) =>
    withEstimatedTokens(item, estimateContextItemTokens(item)),
  );
  const rawItemTokens = original
    .filter(isContextItemIncluded)
    .reduce((sum, item) => sum + (item.estimatedTokens ?? 0), 0);
  const rawTotal = rawItemTokens + toolTokens;

  const planned = original.map((item) => {
    if (!isContextItemIncluded(item)) {
      return markExcluded(item, item.cutReason ?? "disabled");
    }
    if (isEffectivelyEmpty(item)) {
      return markExcluded(item, "empty");
    }

    const kindCap = budget.perKindMaxTokens?.[item.kind];
    let next = item;
    let tokens = item.estimatedTokens ?? 0;
    if (kindCap !== undefined) {
      const currentKindUsage = kindUsage.get(item.kind) ?? 0;
      const remainingKindTokens = Math.max(0, kindCap - currentKindUsage);
      if (tokens > remainingKindTokens) {
        if (remainingKindTokens <= 0) {
          return markExcluded(item, "over_kind_budget");
        }
        next = truncateContextItem(item, remainingKindTokens, "over_kind_budget");
        tokens = next.estimatedTokens ?? remainingKindTokens;
      }
    }

    if (usedTokens + tokens > usableInputTokens) {
      if (!next.sticky) {
        return markExcluded(next, "over_budget");
      }
      next = {
        ...next,
        metadata: {
          ...next.metadata,
          budget: {
            ...(isRecord(next.metadata?.budget) ? next.metadata.budget : {}),
            overBudget: true,
          },
        },
      };
    }

    usedTokens += tokens;
    kindUsage.set(next.kind, (kindUsage.get(next.kind) ?? 0) + tokens);
    return {
      ...next,
      included: true,
      cutReason: undefined,
    };
  });

  const estimatedInputTokens = planned
    .filter(isContextItemIncluded)
    .reduce((sum, item) => sum + (item.estimatedTokens ?? estimateContextItemTokens(item)), toolTokens);

  return {
    budget,
    items: planned,
    debug: {
      maxInputTokens: budget.maxInputTokens,
      reservedOutputTokens: budget.reservedOutputTokens,
      usableInputTokens,
      compactThreshold: budget.compactThreshold,
      compactTriggerTokens,
      estimatedInputTokens,
      estimatedToolTokens: toolTokens,
      estimatedTotalTokens: rawTotal,
      shouldCompact: rawTotal > compactTriggerTokens,
      overBudget: estimatedInputTokens > usableInputTokens,
    },
  };
}

export function truncateContextItem(item: ContextItem, maxTokens: number, reason: ContextCutReason): ContextItem {
  if (maxTokens <= 0) {
    return markExcluded(item, reason);
  }
  const content = truncateTextByEstimatedTokens(item.content, maxTokens);
  const estimatedTokens = estimateContextItemTokens({ ...item, content, estimatedTokens: undefined });
  return {
    ...item,
    content,
    estimatedTokens,
    metadata: {
      ...item.metadata,
      budget: {
        ...(isRecord(item.metadata?.budget) ? item.metadata.budget : {}),
        truncated: true,
        originalEstimatedTokens: item.estimatedTokens ?? estimateContextItemTokens(item),
        maxTokens,
        reason,
      },
    },
  };
}

export function truncateTextByEstimatedTokens(text: string, maxTokens: number): string {
  if (estimateTextAsContextTokens(text) <= maxTokens) {
    return text;
  }
  const suffix = "\n...[truncated]";
  let low = 0;
  let high = text.length;
  let best = "";
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `${text.slice(0, mid).trimEnd()}${suffix}`;
    if (estimateTextAsContextTokens(candidate) <= maxTokens) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best || text.slice(0, Math.max(0, maxTokens)).trimEnd();
}

function markExcluded(item: ContextItem, cutReason: ContextCutReason): ContextItem {
  return {
    ...item,
    included: false,
    cutReason,
  };
}

function isEffectivelyEmpty(item: ContextItem): boolean {
  if (item.content.length > 0) {
    return false;
  }
  const role = item.metadata?.role;
  return !(role === "assistant" && Array.isArray(item.metadata?.toolCalls));
}

function estimateTextAsContextTokens(text: string): number {
  return estimateContextItemTokens({
    id: "estimate",
    kind: "history",
    source: "estimate",
    content: text,
    priority: 0,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
