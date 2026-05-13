import type { ExecutableToolUse } from "./tool.js";

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
  toolCalls?: ExecutableToolUse[];
  toolCallId?: string;
  name?: string;
}

export interface RunResult {
  messages: Message[];
  assistantMessage: Message;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}
