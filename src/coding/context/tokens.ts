import type { Message } from "../../foundation/message.js";
import type { ProviderToolSchema } from "../../foundation/tool.js";

import type { ContextItem } from "./items.js";

export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const asciiWords = text.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const symbolTokens = Math.ceil(text.replace(/[A-Za-z0-9_\s\u3400-\u9fff]/g, "").length / 2);
  return Math.max(1, asciiWords + cjkChars + symbolTokens);
}

export function estimateMessageTokens(message: Message): number {
  let total = estimateTokens(message.role) + estimateTokens(message.content);
  if (message.toolCalls && message.toolCalls.length > 0) {
    total += estimateTokens(JSON.stringify(message.toolCalls));
  }
  if (message.toolCallId) {
    total += estimateTokens(message.toolCallId);
  }
  if (message.name) {
    total += estimateTokens(message.name);
  }
  return total;
}

export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

export function estimateToolSchemaTokens(tools: ProviderToolSchema[] = []): number {
  return tools.reduce((sum, tool) => sum + estimateTokens(JSON.stringify(tool)), 0);
}

export function estimateContextItemTokens(item: ContextItem): number {
  return item.estimatedTokens ?? estimateTokens(item.content);
}

export function estimateContextItemsTokens(items: ContextItem[]): number {
  return items.reduce((sum, item) => sum + estimateContextItemTokens(item), 0);
}
