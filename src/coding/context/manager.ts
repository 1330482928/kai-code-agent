import type { AgentProfileName } from "../../agent/profiles.js";
import type { ProviderAdapter } from "../../provider/types.js";
import type { ProviderToolSchema } from "../../foundation/tool.js";
import type { LoadedSession, SessionRecorder } from "../../session/types.js";

import {
  planContextBudget,
  resolveContextBudget,
  type ContextBudgetPlan,
} from "./budget.js";
import {
  createSummaryContextItem,
  generateCompactionSummary,
} from "./compaction.js";
import {
  isContextItemIncluded,
  type ContextBudget,
  type ContextCompactionDebug,
  type ContextItem,
  type ModelInputBuildResult,
} from "./items.js";
import { ModelInputBuilder } from "./model-input-builder.js";
import { selectRetainedTail } from "./turns.js";

export interface ContextManagerOptions {
  builder?: ModelInputBuilder;
  budget?: Partial<ContextBudget>;
  allowCompaction?: boolean;
  readOnly?: boolean;
  tailTokenBudget?: number;
}

export interface BuildManagedModelInputOptions {
  model: string;
  items: ContextItem[];
  tools?: ProviderToolSchema[];
  provider?: ProviderAdapter;
  signal?: AbortSignal;
  loadedSession?: LoadedSession;
  sessionRecorder?: SessionRecorder;
  profileName?: AgentProfileName;
}

export class ContextManager {
  private readonly builder: ModelInputBuilder;
  private readonly budget: ContextBudget;
  private readonly allowCompaction: boolean;
  private readonly readOnly: boolean;
  private readonly tailTokenBudget?: number;

  constructor(options: ContextManagerOptions = {}) {
    this.budget = resolveContextBudget(options.budget);
    this.builder = options.builder ?? new ModelInputBuilder({ budget: this.budget });
    this.allowCompaction = options.allowCompaction ?? true;
    this.readOnly = options.readOnly ?? false;
    this.tailTokenBudget = options.tailTokenBudget;
  }

  async build(options: BuildManagedModelInputOptions): Promise<ModelInputBuildResult> {
    const initialPlan = planContextBudget({
      items: options.items,
      tools: options.tools,
      budget: this.budget,
    });

    if (!initialPlan.debug.shouldCompact) {
      return this.buildWithDebug(options, initialPlan, {
        decision: "not_needed",
        compactedItemIds: [],
        preservedItemIds: initialPlan.items.filter(isContextItemIncluded).map((item) => item.id),
      });
    }

    const compactableItems = initialPlan.items.filter(isSessionHistoryItem);
    if (!this.allowCompaction || this.readOnly) {
      return this.buildWithDebug(options, initialPlan, {
        decision: this.readOnly ? "would_compact" : "skipped",
        reason: this.readOnly ? "read_only" : "compaction_disabled",
        compactedItemIds: compactableItems.map((item) => item.id),
        preservedItemIds: initialPlan.items.filter(isContextItemIncluded).map((item) => item.id),
        sourceMessageIds: messageIdsFromItems(compactableItems),
      });
    }

    if (!options.loadedSession || !options.sessionRecorder?.recordCompactionSummary || !options.provider || !options.signal) {
      return this.buildWithDebug(options, markUnavailable(initialPlan), {
        decision: "skipped",
        reason: "compaction_unavailable",
        compactedItemIds: compactableItems.map((item) => item.id),
        preservedItemIds: initialPlan.items.filter(isContextItemIncluded).map((item) => item.id),
        sourceMessageIds: messageIdsFromItems(compactableItems),
      });
    }

    if (compactableItems.length === 0) {
      return this.buildWithDebug(options, initialPlan, {
        decision: "skipped",
        reason: "no_compactable_history",
        compactedItemIds: [],
        preservedItemIds: initialPlan.items.filter(isContextItemIncluded).map((item) => item.id),
      });
    }

    try {
      const selection = selectRetainedTail(compactableItems, this.tailBudget(initialPlan));
      if (selection.compactedItems.length === 0) {
        return this.buildWithDebug(options, initialPlan, {
          decision: "skipped",
          reason: "tail_requires_all_history",
          compactedItemIds: [],
          preservedItemIds: selection.preservedItemIds,
          preservedMessageIds: selection.preservedMessageIds,
        });
      }

      const summary = await generateCompactionSummary({
        provider: options.provider,
        model: options.model,
        items: selection.compactedItems,
        signal: options.signal,
      });
      const record = await options.sessionRecorder.recordCompactionSummary({
        summary,
        sourceMessageIds: selection.compactedMessageIds,
        preservedMessageIds: selection.preservedMessageIds,
        compactedItemIds: selection.compactedItemIds,
        preservedItemIds: selection.preservedItemIds,
        profile: options.profileName,
      });
      const summaryItem = createSummaryContextItem({
        sessionId: options.loadedSession.session.id,
        summary,
        selection,
        metadata: {
          summaryMessageId: record.messageId,
          summaryPartId: record.partId,
          reusedSummary: record.reused,
        },
      });
      const finalItems = options.items.map((item) => {
        if (selection.compactedItemIds.includes(item.id)) {
          return { ...item, included: false, cutReason: "replaced_by_summary" as const };
        }
        return item;
      });
      finalItems.push(summaryItem);
      const finalPlan = planContextBudget({
        items: finalItems,
        tools: options.tools,
        budget: this.budget,
      });
      return this.buildWithDebug(options, finalPlan, {
        decision: "compacted",
        compactedItemIds: selection.compactedItemIds,
        preservedItemIds: selection.preservedItemIds,
        summaryItemId: summaryItem.id,
        sourceMessageIds: selection.compactedMessageIds,
        preservedMessageIds: selection.preservedMessageIds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Context compaction failed: ${message}`, { cause: error });
    }
  }

  private buildWithDebug(
    options: BuildManagedModelInputOptions,
    plan: ContextBudgetPlan,
    compaction: ContextCompactionDebug,
  ): ModelInputBuildResult {
    const build = this.builder.build({
      model: options.model,
      items: plan.items,
      tools: options.tools,
    });
    return {
      ...build,
      debug: {
        ...build.debug,
        budgetPlan: plan.debug,
        compaction,
      },
    };
  }

  private tailBudget(plan: ContextBudgetPlan): number {
    if (this.tailTokenBudget !== undefined) {
      return this.tailTokenBudget;
    }
    return Math.max(256, Math.floor(plan.debug.usableInputTokens * 0.35));
  }
}

function isSessionHistoryItem(item: ContextItem): boolean {
  return isContextItemIncluded(item) &&
    (item.kind === "history" || item.kind === "tool_result") &&
    typeof item.metadata?.messageId === "string" &&
    typeof item.source === "string" &&
    item.source.startsWith("session.");
}

function markUnavailable(plan: ContextBudgetPlan): ContextBudgetPlan {
  return {
    ...plan,
    items: plan.items.map((item) => {
      if (!isSessionHistoryItem(item) || item.sticky) {
        return item;
      }
      return {
        ...item,
        included: false,
        cutReason: "compaction_unavailable" as const,
      };
    }),
  };
}

function messageIdsFromItems(items: ContextItem[]): string[] {
  return [...new Set(items.flatMap((item) => {
    const messageId = item.metadata?.messageId;
    return typeof messageId === "string" ? [messageId] : [];
  }))];
}
