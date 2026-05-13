import type { LoadedSession } from "./types.js";
import { projectTranscriptHistory } from "./projector.js";

export function exportSessionJsonl(loaded: LoadedSession): string {
  const lines: string[] = [
    safeJsonLine({ recordType: "session", ...loaded.session }),
  ];
  for (const message of loaded.messages) {
    const { parts, ...messageRecord } = message;
    lines.push(safeJsonLine({ recordType: "message", ...messageRecord }));
    for (const part of parts) {
      lines.push(safeJsonLine({ recordType: "part", ...part }));
      if (part.type === "tool_result" && part.metadata.bash) {
        lines.push(safeJsonLine({
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
  const lines = projectTranscriptHistory(loaded).map((item) => `${labels[item.role]}: ${redactSessionText(item.text)}`);
  return `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`;
}

function safeJsonLine(value: unknown): string {
  return redactSessionText(JSON.stringify(value));
}

function redactSessionText(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-********")
    .replace(/\b(api[_-]?key|apikey|token|secret)(\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1$2********");
}
