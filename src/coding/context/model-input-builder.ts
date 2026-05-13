import type { Message } from "../../foundation/message.js";
import type { ProviderToolSchema } from "../../foundation/tool.js";

import {
  DEFAULT_CONTEXT_BUDGET,
  isContextItemIncluded,
  type ContextBudget,
  type ContextDebugItem,
  type ContextItem,
  type ContextItemKind,
  type ModelInputBuildResult,
  withEstimatedTokens,
} from "./items.js";
import { messageFromContextItem } from "./history.js";
import { estimateContextItemTokens, estimateMessagesTokens, estimateToolSchemaTokens } from "./tokens.js";

export interface ModelInputBuilderOptions {
  budget?: Partial<ContextBudget>;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface BuildModelInputOptions {
  model: string;
  items: ContextItem[];
  tools?: ProviderToolSchema[];
}

export class ModelInputBuilder {
  private readonly budget: ContextBudget;
  private readonly maxOutputTokens: number;
  private readonly temperature?: number;

  constructor(options: ModelInputBuilderOptions = {}) {
    this.budget = {
      ...DEFAULT_CONTEXT_BUDGET,
      ...options.budget,
      perKindMaxTokens: {
        ...DEFAULT_CONTEXT_BUDGET.perKindMaxTokens,
        ...options.budget?.perKindMaxTokens,
      },
    };
    this.maxOutputTokens = options.maxOutputTokens ?? this.budget.reservedOutputTokens;
    this.temperature = options.temperature;
  }

  build(options: BuildModelInputOptions): ModelInputBuildResult {
    const tools = options.tools ?? [];
    const ordered = orderContextItems(options.items).map((item) =>
      withEstimatedTokens(item, estimateContextItemTokens(item)),
    );
    const system = ordered
      .filter((item) => isContextItemIncluded(item) && isSystemContextKind(item.kind))
      .map(formatSystemItem);
    const conversation = ordered
      .filter((item) => isContextItemIncluded(item) && !isSystemContextKind(item.kind))
      .map(messageFromContextItem)
      .filter((message): message is Message => message !== undefined);
    const messages: Message[] = [
      ...system.map((content) => ({ role: "system" as const, content })),
      ...conversation,
    ];
    const estimatedInputTokens = estimateMessagesTokens(messages) + estimateToolSchemaTokens(tools);
    const providerInput = {
      model: options.model,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    };
    return {
      providerInput,
      items: ordered,
      system,
      messages,
      tools,
      generation: {
        maxOutputTokens: this.maxOutputTokens,
        ...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
      },
      debug: {
        items: ordered.map(toDebugItem),
        estimatedInputTokens,
        budget: this.budget,
      },
    };
  }
}

export function orderContextItems(items: ContextItem[]): ContextItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.priority !== b.item.priority) {
        return a.item.priority - b.item.priority;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export function isSystemContextKind(kind: ContextItemKind): boolean {
  return kind === "base" ||
    kind === "profile" ||
    kind === "environment" ||
    kind === "instruction" ||
    kind === "summary" ||
    kind === "plan" ||
    kind === "skill" ||
    kind === "memory" ||
    kind === "permission" ||
    kind === "subagent";
}

function formatSystemItem(item: ContextItem): string {
  if (item.kind === "plan") {
    return item.content;
  }
  return `# ${contextTitle(item)}\n${item.content}`;
}

function contextTitle(item: ContextItem): string {
  if (item.kind === "base") {
    return "Kai Base Instructions";
  }
  if (item.kind === "profile") {
    return "Agent Profile";
  }
  if (item.kind === "instruction") {
    return `Project Instructions: ${item.source}`;
  }
  if (item.kind === "environment") {
    return "Runtime Context";
  }
  return `${item.kind}: ${item.source}`;
}

function toDebugItem(item: ContextItem): ContextDebugItem {
  const included = isContextItemIncluded(item) && !isEffectivelyEmpty(item);
  return {
    id: item.id,
    kind: item.kind,
    source: item.source,
    priority: item.priority,
    estimatedTokens: item.estimatedTokens ?? estimateContextItemTokens(item),
    included,
    ...(!included ? { cutReason: item.cutReason ?? "empty" as const } : {}),
    ...(item.metadata ? { metadata: item.metadata } : {}),
  };
}

function isEffectivelyEmpty(item: ContextItem): boolean {
  if (item.content.length > 0) {
    return false;
  }
  const role = item.metadata?.role;
  return !(role === "assistant" && Array.isArray(item.metadata?.toolCalls));
}
