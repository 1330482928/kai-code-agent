import type { PromptDebugSnapshot } from "../debug.js";
import type { ContextEvalFixture, ContextQualityEvaluation, ContextQualityMetrics, ContextQualityTrace } from "./types.js";

export function computeContextQualityMetrics(input: {
  trace: ContextQualityTrace;
  snapshot: PromptDebugSnapshot;
  fixture?: ContextEvalFixture;
  diffSize?: number;
}): ContextQualityMetrics {
  const includedItems = input.snapshot.items.filter((item) => item.included);
  const systemTokens = input.snapshot.provider.tools.reduce((sum, tool) => sum + tool.tokens, 0);
  const messageTokens = input.snapshot.provider.messages.reduce((sum, message) => sum + message.tokens, 0);
  const totalTokens = Math.max(1, input.snapshot.budgetPlan?.estimatedInputTokens ?? input.trace.modelInputDigest.estimatedInputTokens ?? 1);
  const criticalFacts = input.fixture?.criticalFacts ?? [];
  const retention = criticalFacts.length === 0
    ? 1
    : criticalFacts.filter((fact) => includedItems.some((item) => item.preview?.includes(fact) || item.source.includes(fact))).length / criticalFacts.length;
  const staleCount = input.snapshot.items.filter((item) => !item.included && ["compaction_unavailable", "replaced_by_summary", "deduped"].includes(item.cutReason ?? "")).length;
  const toolBloatRatio = totalTokens === 0 ? 0 : Math.min(1, systemTokens / totalTokens);
  const compressionRatio = input.trace.items.length === 0
    ? 1
    : Math.min(1, includedItems.length / input.trace.items.length);
  return {
    inputTokenRatio: totalTokens / Math.max(1, input.snapshot.budgetPlan?.usableInputTokens ?? totalTokens),
    criticalFactRetention: retention,
    staleOrConflictingItemCount: staleCount,
    toolResultBloatRatio: toolBloatRatio,
    summaryCompressionRatio: compressionRatio,
    cacheStableSectionChurn: 0,
    promptDebugDiffSize: input.diffSize ?? messageTokens,
  };
}

export function evaluateContextQualityFixture(input: {
  fixture: ContextEvalFixture;
  snapshot: PromptDebugSnapshot;
  diffSize?: number;
}): ContextQualityEvaluation {
  const metrics = computeContextQualityMetrics({
    trace: input.fixture.trace,
    snapshot: input.snapshot,
    fixture: input.fixture,
    diffSize: input.diffSize,
  });
  const includedTexts = input.snapshot.items
    .filter((item) => item.included)
    .map((item) => `${item.id}\n${item.source}\n${item.preview ?? ""}\n${JSON.stringify(item.metadata ?? {})}`);
  return {
    fixtureId: input.fixture.id,
    metrics,
    includesCriticalFacts: (input.fixture.criticalFacts ?? []).every((fact) => includedTexts.some((text) => text.includes(fact))),
    excludesForbiddenFacts: (input.fixture.forbiddenFacts ?? []).every((fact) => !includedTexts.some((text) => text.includes(fact))),
    expectedIncludedItemIds: input.fixture.expectedIncludedItemIds ?? [],
    expectedExcludedKinds: input.fixture.expectedExcludedKinds ?? [],
  };
}

export function formatContextQualityMetrics(metrics: ContextQualityMetrics): string {
  return [
    "Context Quality Metrics",
    `- inputTokenRatio: ${formatNumber(metrics.inputTokenRatio)}`,
    `- criticalFactRetention: ${formatNumber(metrics.criticalFactRetention)}`,
    `- staleOrConflictingItemCount: ${metrics.staleOrConflictingItemCount}`,
    `- toolResultBloatRatio: ${formatNumber(metrics.toolResultBloatRatio)}`,
    `- summaryCompressionRatio: ${formatNumber(metrics.summaryCompressionRatio)}`,
    `- cacheStableSectionChurn: ${formatNumber(metrics.cacheStableSectionChurn)}`,
    `- promptDebugDiffSize: ${metrics.promptDebugDiffSize}`,
  ].join("\n");
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : String(value);
}
