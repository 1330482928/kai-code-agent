import type { LoadedSession } from "./types.js";
import { projectTranscriptHistory } from "./projector.js";

export function exportSessionJsonl(loaded: LoadedSession): string {
  const lines: string[] = [
    JSON.stringify({ recordType: "session", ...loaded.session }),
  ];
  for (const message of loaded.messages) {
    const { parts, ...messageRecord } = message;
    lines.push(JSON.stringify({ recordType: "message", ...messageRecord }));
    for (const part of parts) {
      lines.push(JSON.stringify({ recordType: "part", ...part }));
      if (part.type === "tool_result" && part.metadata.bash) {
        lines.push(JSON.stringify({
          recordType: "bash",
          messageId: message.id,
          partId: part.id,
          metadata: part.metadata.bash,
        }));
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export function replaySessionPlain(loaded: LoadedSession): string {
  const labels = {
    user: "User",
    assistant: "Assistant",
    tool: "Tool",
  } as const;
  const lines = projectTranscriptHistory(loaded).map((item) => `${labels[item.role]}: ${item.text}`);
  return `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`;
}
