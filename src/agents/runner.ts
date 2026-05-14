import { runReactLoop } from "../agent/react-loop.js";
import { createContextItem, type ContextItem } from "../coding/context/index.js";
import { createDefaultToolRegistry, ToolRegistry, type ToolRegistry as ToolRegistryType } from "../coding/tools/registry.js";
import { openSideTranscript } from "./transcript.js";
import { buildSubAgentContextItem } from "./context.js";
import type { AgentCatalogEntry, AgentRunResult, AgentRunRuntime } from "./types.js";

export interface RunSubAgentInput {
  agent: AgentCatalogEntry;
  task: string;
  runtime: AgentRunRuntime;
  toolCallId: string;
  signal: AbortSignal;
}

export interface SubAgentToolMailbox {
  push(result: AgentRunResult): void;
  list(): AgentRunResult[];
}

export function createSubAgentToolMailbox(): SubAgentToolMailbox {
  const results: AgentRunResult[] = [];
  return {
    push(result: AgentRunResult) {
      results.push(result);
    },
    list() {
      return [...results];
    },
  };
}

export function buildSubAgentContextItems(mailbox: SubAgentToolMailbox): ContextItem[] {
  return mailbox.list().map((result) => buildSubAgentContextItem(result));
}

export async function runSubAgent(input: RunSubAgentInput): Promise<AgentRunResult> {
  const sideTranscript = await openSideTranscript({
    cwd: input.runtime.cwd,
    agentName: input.agent.name,
    parentSessionId: input.runtime.sessionId,
    toolCallId: input.toolCallId,
    ...(input.runtime.sessionDbPath ? { sessionDbPath: input.runtime.sessionDbPath } : {}),
  });

  try {
    const childRegistry = createChildToolRegistry(input.runtime.toolRegistry, input.agent.tools);
    const buildPrompt = createContextItem({
      id: `subagent:${input.agent.normalizedName}:prompt`,
      kind: "instruction",
      source: `subagent.${input.agent.name}`,
      content: input.agent.prompt,
      priority: 20,
      sticky: true,
      cacheStable: false,
      metadata: {
        agentName: input.agent.name,
        sourcePath: input.agent.sourcePath,
        ...(input.agent.skills && input.agent.skills.length > 0 ? { skills: input.agent.skills } : {}),
      },
    });

    await runReactLoop({
      task: input.task,
      model: input.runtime.model,
      provider: input.runtime.provider,
      cwd: input.runtime.cwd,
      sessionId: sideTranscript.session.id,
      sessionRecorder: sideTranscript.recorder,
      toolRegistry: childRegistry,
      contextItems: [buildPrompt],
      contextOptions: {
        includeBase: true,
        includeInstructions: false,
        includeRuntime: false,
      },
      profileName: "build",
      signal: input.signal,
      maxIterations: input.agent.maxTurns,
    });

    const loaded = sideTranscript.store.loadSession(sideTranscript.session.id);
    const result = extractAgentRunResult({
      agent: input.agent,
      sideTranscriptId: sideTranscript.session.id,
      loaded,
      fallbackTask: input.task,
    });
    return result;
  } catch (error) {
    const loaded = sideTranscript.store.loadSession(sideTranscript.session.id);
    const result = extractAgentRunResult({
      agent: input.agent,
      sideTranscriptId: sideTranscript.session.id,
      loaded,
      fallbackTask: input.task,
      error,
    });
    return result;
  } finally {
    sideTranscript.store.close();
  }
}

function createChildToolRegistry(parentRegistry: ToolRegistryType | undefined, allowedTools: string[]): ToolRegistry {
  const baseTools = parentRegistry?.list() ?? createDefaultToolRegistry().list();
  const allowed = new Set(allowedTools);
  return new ToolRegistry(baseTools.filter((tool) => allowed.has(tool.name)));
}

function extractAgentRunResult(input: {
  agent: AgentCatalogEntry;
  sideTranscriptId: string;
  loaded: import("../session/types.js").LoadedSession | undefined;
  fallbackTask: string;
  error?: unknown;
}): AgentRunResult {
  const lastAssistant = [...(input.loaded?.messages ?? [])].reverse().find((message) => message.role === "assistant");
  const assistantText = lastAssistant?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  const parsed = parseSummaryPayload(assistantText ?? "");
  const summary = parsed.summary || assistantText || input.fallbackTask;
  const changedFiles = parsed.changedFiles;
  const openQuestions = parsed.openQuestions;
  return {
    agentName: input.agent.name,
    sideTranscriptId: input.sideTranscriptId,
    summary,
    changedFiles,
    openQuestions,
    metadata: {
      ...(input.error ? { error: errorMessage(input.error) } : {}),
      ...(assistantText ? { assistantText } : {}),
    },
  };
}

function parseSummaryPayload(text: string): { summary: string; changedFiles: string[]; openQuestions: string[] } {
  if (!text) {
    return { summary: "", changedFiles: [], openQuestions: [] };
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed)) {
      return {
        summary: stringFromUnknown(parsed.summary) ?? stringFromUnknown(parsed.message) ?? "",
        changedFiles: stringArrayFromUnknown(parsed.changedFiles),
        openQuestions: stringArrayFromUnknown(parsed.openQuestions),
      };
    }
  } catch {
    // fall through
  }
  const summary = extractSection(text, ["summary", "result", "answer"]);
  const changedFiles = extractListSection(text, ["changed files", "changed_files"]);
  const openQuestions = extractListSection(text, ["open questions", "questions"]);
  return { summary, changedFiles, openQuestions };
}

function extractSection(text: string, labels: string[]): string {
  for (const label of labels) {
    const regex = new RegExp(`^\\s*${escapeRegExp(label)}\\s*[:=-]\\s*(.+)$`, "imim");
    const match = text.match(regex);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return text.trim();
}

function extractListSection(text: string, labels: string[]): string[] {
  for (const label of labels) {
    const regex = new RegExp(`^\\s*${escapeRegExp(label)}\\s*[:=-]\\s*(.+)$`, "imim");
    const match = text.match(regex);
    if (match?.[1]) {
      return match[1].split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
