import type { Message } from "../foundation/message.js";
import type { ExecutableToolUse, JsonObject, ToolResult } from "../foundation/tool.js";

export type SessionMessageRole = "user" | "assistant" | "tool";

export type SessionPartType =
  | "text"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "summary";

export interface SessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  title?: string;
  metadata: JsonObject;
}

export interface SessionSummary extends SessionRecord {
  messageCount: number;
  summary?: string;
}

export interface TranscriptMessage {
  id: string;
  sessionId: string;
  role: SessionMessageRole;
  ordinal: number;
  createdAt: string;
  summary?: string;
  metadata: JsonObject;
  parts: TranscriptPart[];
}

export interface TranscriptPart {
  id: string;
  messageId: string;
  ordinal: number;
  type: SessionPartType;
  text?: string;
  modelContent?: string;
  metadata: JsonObject;
  createdAt: string;
}

export interface LoadedSession {
  session: SessionRecord;
  messages: TranscriptMessage[];
}

export interface BashRunMetadata {
  command: string;
  cwd: string;
  exitCode: number | null;
  interrupted: boolean;
  preview: string;
  bytes: number;
  startedAt: string;
  endedAt: string;
}

export interface PromptSubmissionMetadata {
  slashCommand?: string;
  requestedModel?: string;
  requestedMode?: string;
  requestedProfile?: string;
  requestedSkillName?: string;
  resumeSessionId?: string;
  [key: string]: unknown;
}

export interface PromptSubmission {
  text: string;
  metadata?: PromptSubmissionMetadata;
}

export interface AppendMessageInput {
  id?: string;
  sessionId: string;
  role: SessionMessageRole;
  summary?: string;
  metadata?: JsonObject;
  createdAt?: string;
}

export interface AppendPartInput {
  id?: string;
  messageId: string;
  type: SessionPartType;
  text?: string;
  modelContent?: string;
  metadata?: JsonObject;
  createdAt?: string;
}

export interface SessionStore {
  createSession(input?: { id?: string; cwd?: string; title?: string; metadata?: JsonObject }): SessionRecord;
  getSession(sessionId: string): SessionRecord | undefined;
  loadSession(sessionId: string): LoadedSession | undefined;
  listSessions(): SessionSummary[];
  appendMessage(input: AppendMessageInput): TranscriptMessage;
  appendPart(input: AppendPartInput): TranscriptPart;
  close(): void;
}

export interface RecordUserMessageInput {
  task: string;
  submission?: PromptSubmission;
  profile?: string;
  requestedProfile?: string;
}

export interface RecordAssistantMessageInput {
  text: string;
  thinking: string[];
  toolCalls: ExecutableToolUse[];
}

export interface RecordToolResultInput {
  toolUse: ExecutableToolUse;
  rawResult: ToolResult;
  modelContent: string;
  startedAt: string;
  endedAt: string;
  cwd: string;
  profile?: string;
}

export interface SessionRecorder {
  recordUserMessage(input: RecordUserMessageInput): void | Promise<void>;
  recordAssistantMessage(input: RecordAssistantMessageInput): void | Promise<void>;
  recordToolResult(input: RecordToolResultInput): void | Promise<void>;
  completeTurn(result: { status: "success" | "aborted" | "error"; messages?: Message[]; error?: unknown }): void | Promise<void>;
}

export interface RenderedHistoryItem {
  id: string;
  role: SessionMessageRole;
  text: string;
  timestamp: string;
}
