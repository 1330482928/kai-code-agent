import type { ContextItemKind, ContextDebugItem } from "../items.js";

export type ContextQualityTraceItem = ContextDebugItem & {
  preview?: string;
};

export interface ContextQualityTrace {
  sessionId: string;
  turnId: string;
  createdAt: string;
  taskKind: "short_fix" | "long_refactor" | "debugging" | "plan" | "research" | "mixed";
  items: ContextQualityTraceItem[];
  budget: {
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
  compaction?: {
    decision: "not_needed" | "would_compact" | "compacted" | "skipped" | "failed";
    reason?: string;
    compactedItemIds: string[];
    preservedItemIds: string[];
    summaryItemId?: string;
  };
  modelInputDigest: {
    systemHash: string;
    messageCount: number;
    toolCount: number;
    estimatedInputTokens: number;
    reservedOutputTokens: number;
  };
  outcome?: {
    completed: boolean;
    userCorrectionCount: number;
    retryCount: number;
    compactionCount: number;
  };
}

export interface ContextEvalFixture {
  id: string;
  trace: ContextQualityTrace;
  criticalFacts: string[];
  forbiddenFacts?: string[];
  expectedIncludedItemIds?: string[];
  expectedExcludedKinds?: ContextItemKind[];
}

export interface ContextQualityMetrics {
  inputTokenRatio: number;
  criticalFactRetention: number;
  staleOrConflictingItemCount: number;
  toolResultBloatRatio: number;
  summaryCompressionRatio: number;
  cacheStableSectionChurn: number;
  promptDebugDiffSize: number;
}

export interface ContextTuningRule {
  id: string;
  target: "budget" | "ranking" | "dedupe" | "compaction" | "cache_stability";
  description: string;
  enabledByDefault: boolean;
}

export interface ContextQualityEvaluation {
  fixtureId: string;
  metrics: ContextQualityMetrics;
  includesCriticalFacts: boolean;
  excludesForbiddenFacts: boolean;
  expectedIncludedItemIds: string[];
  expectedExcludedKinds: ContextItemKind[];
}
