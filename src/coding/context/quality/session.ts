import type { Message } from "../../../foundation/message.js";
import type { LoadedSession } from "../../../session/types.js";

export function loadedSessionToMessages(loadedSession: LoadedSession): Message[] {
  const messages: Message[] = [];
  for (const message of loadedSession.messages) {
    for (const part of message.parts) {
      if (part.type !== "text") {
        continue;
      }
      messages.push({
        role: message.role === "tool" ? "tool" : message.role,
        content: part.text ?? "",
      });
    }
  }
  return messages;
}

export function currentUserOrdinalFromMessages(messages: Message[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }
  return Math.max(0, messages.length - 1);
}
