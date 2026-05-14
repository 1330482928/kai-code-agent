import { boundText, createContextItem, type ContextItem } from "../coding/context/index.js";
import type { AgentRunResult } from "./types.js";

const MAX_SUBAGENT_CONTENT_CHARS = 2_000;

export function buildSubAgentContextItem(result: AgentRunResult): ContextItem {
  return createContextItem({
    id: `subagent:${result.sideTranscriptId}`,
    kind: "subagent",
    source: `subagent.${result.agentName}`,
    content: boundText(formatSubAgentContent(result), MAX_SUBAGENT_CONTENT_CHARS),
    priority: 60,
    sticky: true,
    cacheStable: false,
    metadata: {
      agentName: result.agentName,
      sideTranscriptId: result.sideTranscriptId,
      changedFiles: result.changedFiles,
      openQuestions: result.openQuestions,
      summary: result.summary,
      ...(result.metadata ? { metadata: result.metadata } : {}),
    },
  });
}

export function formatSubAgentContent(result: AgentRunResult): string {
  const lines = [
    `Sub-agent ${result.agentName} result`,
    `Summary: ${result.summary}`,
    result.changedFiles.length > 0 ? `Changed files: ${result.changedFiles.join(", ")}` : "Changed files: none",
    result.openQuestions.length > 0 ? `Open questions: ${result.openQuestions.join(", ")}` : "Open questions: none",
    `Side transcript: ${result.sideTranscriptId}`,
  ];
  return lines.join("\n");
}

