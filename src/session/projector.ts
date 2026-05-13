import type { RenderedHistoryItem, LoadedSession, TranscriptMessage, TranscriptPart } from "./types.js";

export function projectTranscriptHistory(loaded: LoadedSession): RenderedHistoryItem[] {
  const items: RenderedHistoryItem[] = [];
  for (const message of loaded.messages) {
    const text = projectMessageText(message);
    if (!text) {
      continue;
    }
    items.push({
      id: message.id,
      role: message.role,
      text,
      timestamp: message.createdAt,
    });
  }
  return items;
}

export function projectMessageText(message: TranscriptMessage): string {
  if (message.role === "tool") {
    const result = message.parts.find((part) => part.type === "tool_result");
    const plan = message.parts.find((part) => part.type === "summary" && part.metadata.kind === "plan");
    const compaction = message.parts.find((part) => part.type === "summary" && part.metadata.kind === "compaction");
    if (plan) {
      return projectPlanPart(plan);
    }
    if (compaction) {
      return projectCompactionPart(compaction);
    }
    if (!result) {
      return message.summary ?? "";
    }
    const name = typeof result.metadata.name === "string" ? result.metadata.name : "tool";
    const ok = result.metadata.ok === false ? "failed" : "ok";
    const bash = isRecord(result.metadata.bash) ? result.metadata.bash : undefined;
    if (bash && typeof bash.command === "string") {
      const exitCode = typeof bash.exitCode === "number" ? bash.exitCode : "null";
      return `${name} ${ok}: ${bash.command} (exit ${exitCode})`;
    }
    return `${name} ${ok}: ${result.text ?? message.summary ?? ""}`;
  }

  const visibleText = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  if (visibleText) {
    return visibleText;
  }

  const toolSummaries = message.parts
    .filter((part) => part.type === "tool_call")
    .map(projectToolCall)
    .filter(Boolean);
  return toolSummaries.join("\n") || message.summary || "";
}

function projectPlanPart(part: TranscriptPart): string {
  const status = typeof part.metadata.status === "string" ? part.metadata.status : "updated";
  const planPath = typeof part.metadata.planPath === "string" ? `: ${part.metadata.planPath}` : "";
  if (status === "approved") {
    return `plan approved${planPath}`;
  }
  if (status === "rejected") {
    return `plan rejected${planPath}`;
  }
  if (status === "entered") {
    return `plan entered${planPath}`;
  }
  return `plan updated${planPath}`;
}

function projectCompactionPart(part: TranscriptPart): string {
  const count = Array.isArray(part.metadata.sourceMessageIds)
    ? part.metadata.sourceMessageIds.filter((value) => typeof value === "string").length
    : 0;
  return count > 0 ? `context compacted: ${count} messages summarized` : "context compacted";
}

function projectToolCall(part: TranscriptPart): string {
  const name = typeof part.metadata.name === "string" ? part.metadata.name : "tool";
  const summary = isRecord(part.metadata.summary) && typeof part.metadata.summary.detail === "string"
    ? part.metadata.summary.detail
    : part.text;
  return summary ? `${name}: ${summary}` : name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
