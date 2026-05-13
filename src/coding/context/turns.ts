import {
  isContextItemIncluded,
  type ContextItem,
} from "./items.js";
import { estimateContextItemTokens } from "./tokens.js";

export interface ContextTurnSegment {
  id: string;
  items: ContextItem[];
  estimatedTokens: number;
  protected: boolean;
  reason?: "tool_pair" | "orphan_tool_result" | "pending_tool_call";
}

export interface RetainedTailSelection {
  compactedItems: ContextItem[];
  preservedItems: ContextItem[];
  compactedItemIds: string[];
  preservedItemIds: string[];
  compactedMessageIds: string[];
  preservedMessageIds: string[];
  segments: ContextTurnSegment[];
}

export function splitContextTurnSegments(items: ContextItem[]): ContextTurnSegment[] {
  const segments: ContextTurnSegment[] = [];
  const consumed = new Set<number>();

  for (let index = 0; index < items.length; index += 1) {
    if (consumed.has(index)) {
      continue;
    }
    const item = items[index];
    if (!item) {
      continue;
    }

    const toolCallIds = toolCallIdsFromItem(item);
    if (toolCallIds.length > 0) {
      const segmentItems = [item];
      consumed.add(index);
      for (let nextIndex = index + 1; nextIndex < items.length; nextIndex += 1) {
        const candidate = items[nextIndex];
        if (!candidate || consumed.has(nextIndex)) {
          continue;
        }
        const toolCallId = stringMetadata(candidate, "toolCallId");
        if (candidate.metadata?.role === "tool" && toolCallId && toolCallIds.includes(toolCallId)) {
          segmentItems.push(candidate);
          consumed.add(nextIndex);
        }
      }
      segments.push(createSegment(`segment:${segments.length}:tool_pair`, segmentItems, "tool_pair"));
      continue;
    }

    if (item.metadata?.role === "tool") {
      consumed.add(index);
      segments.push(createSegment(`segment:${segments.length}:orphan_tool`, [item], "orphan_tool_result"));
      continue;
    }

    consumed.add(index);
    segments.push(createSegment(`segment:${segments.length}:${item.id}`, [item]));
  }

  return segments;
}

export function selectRetainedTail(items: ContextItem[], maxTailTokens: number): RetainedTailSelection {
  const includedItems = items.filter(isContextItemIncluded);
  const segments = splitContextTurnSegments(includedItems);
  const preserved = new Set<string>();
  let usedTokens = 0;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    const wouldFit = usedTokens + segment.estimatedTokens <= maxTailTokens;
    if (!wouldFit && preserved.size > 0) {
      continue;
    }
    if (!wouldFit && !segment.protected) {
      continue;
    }
    for (const item of segment.items) {
      preserved.add(item.id);
    }
    usedTokens += segment.estimatedTokens;
  }

  const preservedItems = includedItems.filter((item) => preserved.has(item.id));
  const compactedItems = includedItems.filter((item) => !preserved.has(item.id));
  return {
    compactedItems,
    preservedItems,
    compactedItemIds: compactedItems.map((item) => item.id),
    preservedItemIds: preservedItems.map((item) => item.id),
    compactedMessageIds: uniqueStrings(compactedItems.flatMap(messageIdsFromItem)),
    preservedMessageIds: uniqueStrings(preservedItems.flatMap(messageIdsFromItem)),
    segments,
  };
}

export function toolCallIdsFromItem(item: ContextItem): string[] {
  const value = item.metadata?.toolCalls;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((toolCall) => {
    if (typeof toolCall === "object" && toolCall !== null && !Array.isArray(toolCall)) {
      const id = (toolCall as Record<string, unknown>).id;
      return typeof id === "string" ? [id] : [];
    }
    return [];
  });
}

export function messageIdsFromItem(item: ContextItem): string[] {
  const messageId = stringMetadata(item, "messageId");
  return messageId ? [messageId] : [];
}

function createSegment(
  id: string,
  items: ContextItem[],
  reason?: ContextTurnSegment["reason"],
): ContextTurnSegment {
  return {
    id,
    items,
    estimatedTokens: items.reduce((sum, item) => sum + estimateContextItemTokens(item), 0),
    protected: reason === "tool_pair" || reason === "pending_tool_call",
    ...(reason ? { reason } : {}),
  };
}

function stringMetadata(item: ContextItem, key: string): string | undefined {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
