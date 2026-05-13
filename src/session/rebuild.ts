import type { Message } from "../foundation/message.js";
import type { ExecutableToolUse, JsonObject } from "../foundation/tool.js";

import type { LoadedSession, TranscriptMessage, TranscriptPart } from "./types.js";
import { approvedPlanContextFromSession } from "../coding/plan/store.js";

export interface RebuildProviderMessagesOptions {
  includeThinking?: boolean;
}

export function rebuildProviderMessages(
  loaded: LoadedSession,
  options: RebuildProviderMessagesOptions = {},
): Message[] {
  const approvedPlanContext = approvedPlanContextFromSession(loaded);
  const messages: Message[] = approvedPlanContext
    ? [{ role: "system", content: approvedPlanContext }]
    : [];
  for (const message of loaded.messages) {
    if (message.role === "user") {
      messages.push({ role: "user", content: textFromParts(message.parts, { includeThinking: false }) });
      continue;
    }

    if (message.role === "assistant") {
      const content = textFromParts(message.parts, { includeThinking: options.includeThinking === true });
      const toolCalls = toolCallsFromParts(message.parts);
      messages.push({
        role: "assistant",
        content,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      });
      continue;
    }

    const toolResult = message.parts.find((part) => part.type === "tool_result");
    if (toolResult) {
      messages.push({
        role: "tool",
        content: toolResult.modelContent ?? toolResult.text ?? "",
        toolCallId: stringMetadata(toolResult, "toolCallId"),
        name: stringMetadata(toolResult, "name"),
      });
    }
  }
  return messages;
}

function textFromParts(parts: TranscriptPart[], options: { includeThinking: boolean }): string {
  return parts
    .filter((part) => part.type === "text" || (options.includeThinking && part.type === "thinking"))
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

function stringMetadata(part: TranscriptPart, key: string): string | undefined {
  const value = part.metadata[key];
  return typeof value === "string" ? value : undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
