import type { Message } from "../../foundation/message.js";
import type { ExecutableToolUse, JsonObject } from "../../foundation/tool.js";
import { boundPlanContext, latestPlanPart } from "../plan/store.js";
import type { AgentProfileName } from "../../agent/profiles.js";
import type { LoadedSession, TranscriptMessage, TranscriptPart } from "../../session/types.js";
import { formatSummaryForModel } from "./compaction.js";

import {
  createContextItem,
  createExcludedContextItem,
  isContextItemIncluded,
  type ContextItem,
} from "./items.js";

export interface MessageContextProjectionOptions {
  source?: string;
  basePriority?: number;
  currentUserOrdinal?: number;
}

export function contextItemsFromMessages(
  messages: Message[],
  options: MessageContextProjectionOptions = {},
): ContextItem[] {
  const source = options.source ?? "messages";
  const basePriority = options.basePriority ?? 100;
  return messages.map((message, index) => contextItemFromMessage(message, {
    id: `${source}:${index}:${message.role}`,
    source: `${source}.${index}`,
    priority: basePriority + index,
    current: options.currentUserOrdinal === index,
  }));
}

export function providerMessagesFromContextItems(items: ContextItem[]): Message[] {
  return items
    .filter(isContextItemIncluded)
    .map(messageFromContextItem)
    .filter((message): message is Message => message !== undefined);
}

export function contextItemsFromLoadedSession(
  loaded: LoadedSession | undefined,
  options: { includeThinking?: boolean; basePriority?: number } = {},
): ContextItem[] {
  if (!loaded) {
    return [];
  }
  const items: ContextItem[] = [];
  const basePriority = options.basePriority ?? 100;
  const compaction = latestCompactionSummary(loaded.messages);
  if (compaction) {
    items.push(createContextItem({
      id: `session:${compaction.message.id}:compaction-summary`,
      kind: "summary",
      source: `session.${loaded.session.id}.message.${compaction.message.ordinal}.compaction`,
      content: formatSummaryForModel(compaction.part.text ?? ""),
      priority: basePriority + compaction.message.ordinal,
      cacheStable: true,
      metadata: {
        role: "system",
        messageId: compaction.message.id,
        partId: compaction.part.id,
        kind: "compaction",
        sourceMessageIds: compaction.sourceMessageIds,
        preservedMessageIds: compaction.preservedMessageIds,
      },
    }));
  }
  const compactedMessageIds = new Set(compaction?.sourceMessageIds ?? []);
  const preservedMessageIds = new Set(compaction?.preservedMessageIds ?? []);
  loaded.messages.forEach((message, index) => {
    if (message.id === compaction?.message.id) {
      return;
    }
    if (compactedMessageIds.has(message.id) && !preservedMessageIds.has(message.id)) {
      return;
    }
    const priority = basePriority + index;
    if (message.role === "user") {
      items.push(createContextItem({
        id: `session:${message.id}:user`,
        kind: "history",
        source: `session.${loaded.session.id}.message.${message.ordinal}`,
        content: textFromParts(message.parts, { includeThinking: false }),
        priority,
        cacheStable: true,
        metadata: messageMetadata(message, { role: "user" }),
      }));
      return;
    }

    if (message.role === "assistant") {
      const thinking = textFromParts(message.parts, { includeThinking: true, thinkingOnly: true });
      if (thinking.length > 0) {
        items.push(createExcludedContextItem({
          id: `session:${message.id}:thinking`,
          kind: "history",
          source: `session.${loaded.session.id}.message.${message.ordinal}.thinking`,
          content: thinking,
          priority,
          cacheStable: true,
          cutReason: options.includeThinking === true ? "disabled" : "disabled",
          metadata: messageMetadata(message, { role: "assistant", hidden: true }),
        }));
      }
      const content = textFromParts(message.parts, { includeThinking: options.includeThinking === true });
      const toolCalls = toolCallsFromParts(message.parts);
      if (content.length > 0 || toolCalls.length > 0) {
        items.push(createContextItem({
          id: `session:${message.id}:assistant`,
          kind: "history",
          source: `session.${loaded.session.id}.message.${message.ordinal}`,
          content,
          priority,
          cacheStable: true,
          metadata: messageMetadata(message, {
            role: "assistant",
            ...(toolCalls.length > 0 ? { toolCalls: toolCalls as unknown as JsonObject[] } : {}),
          }),
        }));
      }
      return;
    }

    const toolResult = message.parts.find((part) => part.type === "tool_result");
    if (toolResult) {
      items.push(createContextItem({
        id: `session:${message.id}:tool`,
        kind: "tool_result",
        source: `session.${loaded.session.id}.message.${message.ordinal}`,
        content: toolResult.modelContent ?? toolResult.text ?? "",
        priority,
        cacheStable: true,
        metadata: messageMetadata(message, {
          role: "tool",
          toolCallId: stringMetadata(toolResult, "toolCallId") ?? "",
          name: stringMetadata(toolResult, "name") ?? "",
          partId: toolResult.id,
        }),
      }));
      return;
    }

    const planSummary = message.parts.find((part) => part.type === "summary" && part.metadata.kind === "plan");
    if (planSummary) {
      items.push(createExcludedContextItem({
        id: `session:${message.id}:plan-summary`,
        kind: "summary",
        source: `session.${loaded.session.id}.message.${message.ordinal}.plan`,
        content: planSummary.text ?? "",
        priority,
        cacheStable: true,
        cutReason: "disabled",
        metadata: {
          role: "tool",
          messageId: message.id,
          partId: planSummary.id,
          kind: "plan",
          ...planSummary.metadata,
        },
      }));
      return;
    }

    const compactionSummary = message.parts.find((part) => part.type === "summary" && part.metadata.kind === "compaction");
    if (compactionSummary) {
      items.push(createContextItem({
        id: `session:${message.id}:compaction-summary`,
        kind: "summary",
        source: `session.${loaded.session.id}.message.${message.ordinal}.compaction`,
        content: formatSummaryForModel(compactionSummary.text ?? ""),
        priority,
        cacheStable: true,
        metadata: {
          role: "system",
          messageId: message.id,
          partId: compactionSummary.id,
          kind: "compaction",
          sourceMessageIds: stringArrayMetadata(compactionSummary, "sourceMessageIds"),
          preservedMessageIds: stringArrayMetadata(compactionSummary, "preservedMessageIds"),
        },
      }));
    }
  });
  return items;
}

export function approvedPlanContextItemsFromSession(
  loaded: LoadedSession | undefined,
  profileName: AgentProfileName = "build",
): ContextItem[] {
  if (!loaded || profileName === "plan") {
    return [];
  }
  const approved = latestPlanPart(loaded, "approved");
  if (!approved) {
    return [];
  }
  const approvedPlan = stringFromUnknown(approved.metadata.approvedPlan)
    ?? approved.text
    ?? stringFromUnknown(approved.metadata.preview);
  if (!approvedPlan) {
    return [];
  }
  const planPath = stringFromUnknown(approved.metadata.planPath);
  const content = boundPlanContext([
    "Approved implementation plan:",
    planPath ? `Path: ${planPath}` : undefined,
    approvedPlan,
  ].filter(Boolean).join("\n"));
  return [
    createContextItem({
      id: `plan:approved:${stablePlanSource(planPath ?? approved.id)}`,
      kind: "plan",
      source: "session.approvedPlan",
      content,
      priority: 40,
      sticky: true,
      cacheStable: false,
      metadata: {
        status: "approved",
        partId: approved.id,
        ...(planPath ? { planPath } : {}),
      },
    }),
  ];
}

export function messageFromContextItem(item: ContextItem): Message | undefined {
  const role = stringMetadataFromItem(item, "role");
  if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
    return undefined;
  }
  if (role === "tool") {
    return {
      role: "tool",
      content: item.content,
      toolCallId: stringMetadataFromItem(item, "toolCallId"),
      name: stringMetadataFromItem(item, "name"),
    };
  }
  if (role === "assistant") {
    const toolCalls = executableToolUsesFromUnknown(item.metadata?.toolCalls);
    return {
      role: "assistant",
      content: item.content,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }
  return {
    role,
    content: item.content,
  };
}

function contextItemFromMessage(
  message: Message,
  input: { id: string; source: string; priority: number; current: boolean },
): ContextItem {
  const kind = message.role === "tool"
    ? "tool_result"
    : input.current && message.role === "user"
      ? "current_user"
      : "history";
  const metadata: JsonObject = {
    role: message.role,
    ...(input.current ? { current: true } : {}),
    ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
    ...(message.name ? { name: message.name } : {}),
    ...(message.toolCalls ? { toolCalls: message.toolCalls as unknown as JsonObject[] } : {}),
  };
  return createContextItem({
    id: input.id,
    kind,
    source: input.source,
    content: message.content,
    priority: input.priority,
    sticky: input.current,
    cacheStable: !input.current,
    metadata,
  });
}

function textFromParts(
  parts: TranscriptPart[],
  options: { includeThinking: boolean; thinkingOnly?: boolean },
): string {
  return parts
    .filter((part) => {
      if (options.thinkingOnly) {
        return part.type === "thinking";
      }
      return part.type === "text" || (options.includeThinking && part.type === "thinking");
    })
    .map((part) => part.text ?? "")
    .join("");
}

function toolCallsFromParts(parts: TranscriptPart[]): ExecutableToolUse[] {
  return parts
    .filter((part) => part.type === "tool_call")
    .filter((part) => typeof part.metadata.name !== "string" || !part.metadata.name.startsWith("plan_"))
    .map((part) => {
      const metadata = part.metadata;
      return {
        id: typeof metadata.toolCallId === "string" ? metadata.toolCallId : part.id,
        name: typeof metadata.name === "string" ? metadata.name : "tool",
        input: isJsonObject(metadata.input) ? metadata.input : {},
      };
    });
}

function messageMetadata(message: TranscriptMessage, metadata: JsonObject): JsonObject {
  return {
    messageId: message.id,
    ordinal: message.ordinal,
    ...metadata,
  };
}

function stringMetadata(part: TranscriptPart, key: string): string | undefined {
  const value = part.metadata[key];
  return typeof value === "string" ? value : undefined;
}

function stringArrayMetadata(part: TranscriptPart, key: string): string[] {
  const value = part.metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringMetadataFromItem(item: ContextItem, key: string): string | undefined {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function executableToolUsesFromUnknown(value: unknown): ExecutableToolUse[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isJsonObject(item)) {
      return [];
    }
    const id = typeof item.id === "string" ? item.id : undefined;
    const name = typeof item.name === "string" ? item.name : undefined;
    const input = isJsonObject(item.input) ? item.input : undefined;
    return id && name && input ? [{ id, name, input }] : [];
  });
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stablePlanSource(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/-]+/g, "-").slice(-120);
}

function latestCompactionSummary(messages: TranscriptMessage[]): {
  message: TranscriptMessage;
  part: TranscriptPart;
  sourceMessageIds: string[];
  preservedMessageIds: string[];
} | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const part = message?.parts.find((candidate) => candidate.type === "summary" && candidate.metadata.kind === "compaction");
    if (!message || !part) {
      continue;
    }
    return {
      message,
      part,
      sourceMessageIds: stringArrayMetadata(part, "sourceMessageIds"),
      preservedMessageIds: stringArrayMetadata(part, "preservedMessageIds"),
    };
  }
  return undefined;
}
