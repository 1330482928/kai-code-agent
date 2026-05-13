import type { ProviderToolSchema } from "../../foundation/tool.js";
import type { ModelInputBuildResult } from "./items.js";

export interface PromptDebugSnapshot {
  budget: ModelInputBuildResult["debug"]["budget"];
  budgetPlan?: ModelInputBuildResult["debug"]["budgetPlan"];
  compaction?: ModelInputBuildResult["debug"]["compaction"];
  items: Array<ModelInputBuildResult["debug"]["items"][number] & { preview?: string }>;
  provider: {
    model: string;
    messageCount: number;
    messages: Array<{ role: string; tokens: number; preview?: string }>;
    tools: Array<{ name: string; tokens: number }>;
  };
}

export interface BuildPromptDebugSnapshotOptions {
  build: ModelInputBuildResult;
  showItems?: boolean;
  maxPreviewChars?: number;
}

export function buildPromptDebugSnapshot(options: BuildPromptDebugSnapshotOptions): PromptDebugSnapshot {
  const maxPreviewChars = options.maxPreviewChars ?? 240;
  return {
    budget: options.build.debug.budget,
    ...(options.build.debug.budgetPlan ? { budgetPlan: options.build.debug.budgetPlan } : {}),
    ...(options.build.debug.compaction ? { compaction: options.build.debug.compaction } : {}),
    items: options.build.debug.items.map((item) => {
      const source = options.build.items.find((candidate) => candidate.id === item.id);
      return {
        ...item,
        ...(options.showItems && source ? { preview: safeItemPreview(source, maxPreviewChars) } : {}),
      };
    }),
    provider: {
      model: options.build.providerInput.model,
      messageCount: options.build.providerInput.messages.length,
      messages: options.build.providerInput.messages.map((message) => ({
        role: message.role,
        tokens: estimatePreviewTokens(message.content),
        ...(options.showItems ? { preview: safePreview(message.content, maxPreviewChars) } : {}),
      })),
      tools: summarizeTools(options.build.tools),
    },
  };
}

export function renderPromptDebugText(snapshot: PromptDebugSnapshot): string {
  const lines: string[] = [];
  const plan = snapshot.budgetPlan;
  lines.push("Prompt Debug");
  lines.push(`Model: ${snapshot.provider.model}`);
  lines.push(`Messages: ${snapshot.provider.messageCount}`);
  lines.push(`Tools: ${snapshot.provider.tools.map((tool) => tool.name).join(", ") || "none"}`);
  if (plan) {
    lines.push(
      `Budget: ${plan.estimatedInputTokens}/${plan.usableInputTokens} input tokens, ` +
        `reserved ${plan.reservedOutputTokens}, compact at ${plan.compactTriggerTokens}`,
    );
    lines.push(`Compaction: ${snapshot.compaction?.decision ?? (plan.shouldCompact ? "would_compact" : "not_needed")}`);
  }
  lines.push("");
  lines.push("Items:");
  for (const item of snapshot.items) {
    const status = item.included ? "in" : `out:${item.cutReason ?? "unknown"}`;
    lines.push(`- ${status} ${item.estimatedTokens}t ${item.kind} ${item.id} (${item.source})`);
    if (item.preview) {
      lines.push(`  ${item.preview.replace(/\n/g, "\n  ")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function safePreview(text: string, maxChars = 240): string {
  const redacted = redactDebugText(text.replace(/<think>[\s\S]*?<\/think>/gi, "[hidden thinking]"));
  if (redacted.length <= maxChars) {
    return redacted;
  }
  return `${redacted.slice(0, Math.max(0, maxChars - 16)).trimEnd()}\n...[truncated]`;
}

function safeItemPreview(item: ModelInputBuildResult["items"][number], maxChars: number): string {
  if (item.metadata?.hidden === true || item.metadata?.role === "thinking") {
    return "[hidden thinking]";
  }
  return safePreview(item.content, maxChars);
}

export function redactDebugText(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-********")
    .replace(/\b(api[_-]?key|apikey|token|secret)(\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1$2********");
}

function summarizeTools(tools: ProviderToolSchema[]): Array<{ name: string; tokens: number }> {
  return tools.map((tool) => ({
    name: tool.function.name,
    tokens: estimatePreviewTokens(JSON.stringify(tool)),
  }));
}

function estimatePreviewTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
}
