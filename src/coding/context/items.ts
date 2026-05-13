import type { Message } from "../../foundation/message.js";
import type { JsonObject, ProviderToolSchema } from "../../foundation/tool.js";
import type { ProviderInput } from "../../provider/types.js";

export type ContextItemKind =
  | "base"
  | "profile"
  | "environment"
  | "instruction"
  | "history"
  | "summary"
  | "tool_result"
  | "plan"
  | "skill"
  | "memory"
  | "permission"
  | "subagent"
  | "current_user";

export type ContextCutReason =
  | "over_budget"
  | "over_kind_budget"
  | "truncated"
  | "protected_over_budget"
  | "compaction_unavailable"
  | "deduped"
  | "replaced_by_summary"
  | "disabled"
  | "empty";

export interface ContextItemSource {
  type: string;
  id?: string;
  path?: string;
}

export interface ContextItem {
  id: string;
  kind: ContextItemKind;
  source: string;
  content: string;
  priority: number;
  estimatedTokens?: number;
  maxTokens?: number;
  sticky?: boolean;
  cacheStable?: boolean;
  metadata?: JsonObject;
  included?: boolean;
  cutReason?: ContextCutReason;
}

export interface ContextBudget {
  maxInputTokens: number;
  reservedOutputTokens: number;
  compactThreshold: number;
  perKindMaxTokens?: Partial<Record<ContextItemKind, number>>;
}

export interface ContextDebugItem {
  id: string;
  kind: ContextItemKind;
  source: string;
  priority: number;
  estimatedTokens: number;
  included: boolean;
  cutReason?: ContextCutReason;
  metadata?: JsonObject;
}

export interface ContextBudgetDebug {
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
}

export interface ContextCompactionDebug {
  decision: "not_needed" | "would_compact" | "compacted" | "skipped" | "failed";
  reason?: string;
  compactedItemIds: string[];
  preservedItemIds: string[];
  summaryItemId?: string;
  sourceMessageIds?: string[];
  preservedMessageIds?: string[];
}

export interface ModelInputBuildResult {
  providerInput: ProviderInput;
  items: ContextItem[];
  system: string[];
  messages: Message[];
  tools: ProviderToolSchema[];
  generation: {
    maxOutputTokens: number;
    temperature?: number;
  };
  debug: {
    items: ContextDebugItem[];
    estimatedInputTokens: number;
    budget: ContextBudget;
    budgetPlan?: ContextBudgetDebug;
    compaction?: ContextCompactionDebug;
  };
}

export interface CreateContextItemInput {
  id?: string;
  kind: ContextItemKind;
  source: string | ContextItemSource;
  content: string;
  priority: number;
  estimatedTokens?: number;
  maxTokens?: number;
  sticky?: boolean;
  cacheStable?: boolean;
  metadata?: JsonObject;
}

export interface CreateExcludedContextItemInput extends CreateContextItemInput {
  cutReason: ContextCutReason;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxInputTokens: 120_000,
  reservedOutputTokens: 4_000,
  compactThreshold: 0.9,
};

export function createContextItem(input: CreateContextItemInput): ContextItem {
  const source = normalizeContextSource(input.source);
  return {
    id: input.id ?? stableContextItemId(input.kind, source),
    kind: input.kind,
    source,
    content: input.content,
    priority: input.priority,
    ...(input.estimatedTokens !== undefined ? { estimatedTokens: input.estimatedTokens } : {}),
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
    ...(input.sticky !== undefined ? { sticky: input.sticky } : {}),
    ...(input.cacheStable !== undefined ? { cacheStable: input.cacheStable } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    included: true,
  };
}

export function createExcludedContextItem(input: CreateExcludedContextItemInput): ContextItem {
  return {
    ...createContextItem(input),
    included: false,
    cutReason: input.cutReason,
  };
}

export function isContextItemIncluded(item: ContextItem): boolean {
  return item.included !== false && item.cutReason === undefined;
}

export function normalizeContextSource(source: string | ContextItemSource): string {
  if (typeof source === "string") {
    return source;
  }
  return [source.type, source.path ?? source.id].filter(Boolean).join(":");
}

export function stableContextItemId(kind: ContextItemKind, source: string): string {
  return `${kind}:${slugify(source)}`;
}

export function withEstimatedTokens(item: ContextItem, estimatedTokens: number): ContextItem {
  return {
    ...item,
    estimatedTokens,
  };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || "context";
}
