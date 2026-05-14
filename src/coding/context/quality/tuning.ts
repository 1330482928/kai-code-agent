import type { ContextQualityMetrics, ContextTuningRule } from "./types.js";

export function formatContextTuningReport(input: {
  rules: ContextTuningRule[];
  metrics: ContextQualityMetrics;
}): string {
  return [
    "Context Quality Tuning",
    "",
    "Rules:",
    ...input.rules.map((rule) => `- ${rule.id} [${rule.target}] ${rule.enabledByDefault ? "on" : "off"}: ${rule.description}`),
    "",
    "Metrics:",
    `- inputTokenRatio: ${formatNumber(input.metrics.inputTokenRatio)}`,
    `- criticalFactRetention: ${formatNumber(input.metrics.criticalFactRetention)}`,
    `- staleOrConflictingItemCount: ${input.metrics.staleOrConflictingItemCount}`,
    `- toolResultBloatRatio: ${formatNumber(input.metrics.toolResultBloatRatio)}`,
    `- summaryCompressionRatio: ${formatNumber(input.metrics.summaryCompressionRatio)}`,
    `- cacheStableSectionChurn: ${formatNumber(input.metrics.cacheStableSectionChurn)}`,
    `- promptDebugDiffSize: ${input.metrics.promptDebugDiffSize}`,
  ].join("\n");
}

export function defaultContextTuningRules(): ContextTuningRule[] {
  return [
    {
      id: "stable-cache-order",
      target: "cache_stability",
      description: "Keep cache-stable sections in a fixed order so prompt cache churn stays bounded.",
      enabledByDefault: true,
    },
    {
      id: "critical-fact-priority",
      target: "ranking",
      description: "Raise priority for items that preserve critical facts in long tasks.",
      enabledByDefault: true,
    },
    {
      id: "dedupe-tool-noise",
      target: "dedupe",
      description: "Deduplicate repeated tool chatter before it competes with user intent.",
      enabledByDefault: true,
    },
    {
      id: "tail-summary-budget",
      target: "budget",
      description: "Prefer compact tail summaries when compaction risk is high.",
      enabledByDefault: true,
    },
  ];
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : String(value);
}
