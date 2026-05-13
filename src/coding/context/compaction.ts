import type { ProviderAdapter, ProviderInput } from "../../provider/types.js";
import type { JsonObject } from "../../foundation/tool.js";

import { createContextItem, type ContextItem } from "./items.js";
import { estimateContextItemTokens } from "./tokens.js";
import type { RetainedTailSelection } from "./turns.js";

export const COMPACTION_SUMMARY_SECTIONS = [
  "Current Goal",
  "Progress",
  "Decisions / Constraints",
  "Critical Files / Commands / Errors",
  "Remaining Work",
] as const;

export interface BuildCompactionPromptOptions {
  items: ContextItem[];
  maxChars?: number;
}

export interface GenerateCompactionSummaryOptions {
  provider: ProviderAdapter;
  model: string;
  items: ContextItem[];
  signal: AbortSignal;
}

export interface CreateSummaryContextItemOptions {
  sessionId?: string;
  summary: string;
  selection: RetainedTailSelection;
  priority?: number;
  metadata?: JsonObject;
}

export function buildCompactionPrompt(options: BuildCompactionPromptOptions): string {
  const maxChars = options.maxChars ?? 16_000;
  const transcript = options.items
    .map((item) => {
      const role = typeof item.metadata?.role === "string" ? item.metadata.role : item.kind;
      return `## ${role} (${item.source})\n${boundText(item.content, 4_000)}`;
    })
    .join("\n\n");
  return [
    "Summarize the following earlier conversation for a coding agent that will continue the task.",
    "Keep concrete decisions, constraints, file paths, commands, errors, and remaining work.",
    "Do not include hidden reasoning. Do not invent facts.",
    "",
    "Return exactly these markdown sections:",
    ...COMPACTION_SUMMARY_SECTIONS.map((section) => `# ${section}`),
    "",
    "# Transcript To Summarize",
    boundText(transcript, maxChars),
  ].join("\n");
}

export async function generateCompactionSummary(options: GenerateCompactionSummaryOptions): Promise<string> {
  const input: ProviderInput = {
    model: options.model,
    messages: [
      {
        role: "user",
        content: buildCompactionPrompt({ items: options.items }),
      },
    ],
  };
  let text = "";
  for await (const event of options.provider.stream(input, options.signal)) {
    if (event.type === "text_delta") {
      text += event.text;
    }
    if (event.type === "done") {
      break;
    }
  }
  const normalized = normalizeCompactionSummary(text);
  if (!normalized.trim()) {
    throw new Error("Compaction summary generation returned no visible text");
  }
  return normalized;
}

export function createSummaryContextItem(options: CreateSummaryContextItemOptions): ContextItem {
  const source = options.sessionId
    ? `session.${options.sessionId}.compaction`
    : "context.compaction";
  const metadata: JsonObject = {
    role: "system",
    kind: "compaction",
    sourceMessageIds: options.selection.compactedMessageIds,
    preservedMessageIds: options.selection.preservedMessageIds,
    compactedItemIds: options.selection.compactedItemIds,
    preservedItemIds: options.selection.preservedItemIds,
    ...options.metadata,
  };
  return createContextItem({
    id: `summary:compaction:${stableSummaryId(options.selection.compactedItemIds)}`,
    kind: "summary",
    source,
    content: formatSummaryForModel(options.summary),
    priority: options.priority ?? 90,
    sticky: true,
    cacheStable: false,
    estimatedTokens: estimateContextItemTokens({
      id: "summary",
      kind: "summary",
      source,
      content: options.summary,
      priority: 90,
    }),
    metadata,
  });
}

export function normalizeCompactionSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) {
    return "";
  }
  const output: string[] = [];
  for (const section of COMPACTION_SUMMARY_SECTIONS) {
    const existing = extractSection(trimmed, section);
    output.push(`# ${section}`);
    output.push(existing || "- Not captured.");
    output.push("");
  }
  return output.join("\n").trimEnd();
}

export function formatSummaryForModel(summary: string): string {
  return `Conversation summary for compacted earlier history:\n${normalizeCompactionSummary(summary)}`;
}

export function boundText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 16)).trimEnd()}\n...[truncated]`;
}

function extractSection(text: string, section: string): string {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextSections = COMPACTION_SUMMARY_SECTIONS
    .filter((candidate) => candidate !== section)
    .map((candidate) => candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const pattern = new RegExp(`(?:^|\\n)#\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n#\\s+(?:${nextSections})\\s*\\n|$)`, "i");
  const match = pattern.exec(text);
  return match?.[1]?.trim() ?? "";
}

function stableSummaryId(itemIds: string[]): string {
  const joined = itemIds.join("-");
  return joined
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120) || "empty";
}
