import type { ExecutableToolUse, ToolRuntimeEvent } from "./tool.js";
import type { ToolUseSummary } from "./tool-summary.js";

export type UiEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string; hidden: true }
  | { type: "tool_start"; id: string; name: string; summary: ToolUseSummary }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | { type: "bash_progress"; toolCallId: string; output: string; elapsedMs: number; totalBytes: number }
  | { type: "approval_request"; id: string; title: string; body: string }
  | { type: "question_request"; id: string; questions: QuestionPromptInput[] }
  | { type: "plan_approval_request"; id: string; planPath: string; planBody: string }
  | { type: "turn_done" }
  | { type: "turn_aborted"; reason: string };

export interface QuestionPromptInput {
  id: string;
  question: string;
  mode: "single" | "multi";
  options: Array<{ label: string; description: string; preview?: string }>;
}

export function uiEventFromToolRuntimeEvent(event: ToolRuntimeEvent): UiEvent | null {
  if (event.type === "bash_progress") {
    return event;
  }
  return null;
}

export interface ToolLifecycleSnapshot {
  toolUse: ExecutableToolUse;
  summary: ToolUseSummary;
}
