import type { JsonObject } from "../foundation/tool.js";

export type MemoryScope = "session" | "projectLocal" | "project" | "user";
export type MemoryType = "preference" | "fact" | "decision" | "project" | "reference";
export type MemoryStatus = "active" | "stale" | "archived";

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  type: MemoryType;
  status: MemoryStatus;
  text: string;
  projectIdentity?: string;
  projectCwd?: string;
  projectPath?: string;
  sourceSessionId?: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryInput {
  id?: string;
  scope: MemoryScope;
  type: MemoryType;
  status?: MemoryStatus;
  text: string;
  projectIdentity?: string;
  projectCwd?: string;
  projectPath?: string;
  sourceSessionId?: string;
  sourceMessageId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemoryVisibilityContext {
  cwd?: string;
  projectIdentity?: string;
  projectCwd?: string;
  projectPath?: string;
  sessionId?: string;
}

export interface MemoryListInput {
  scope?: MemoryScope;
  type?: MemoryType;
  visibility?: MemoryVisibilityContext;
}

export interface MemorySearchInput extends MemoryListInput {
  query: string;
  limit?: number;
  now?: Date;
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
  reason: string;
  matchedTerms: string[];
}

export type MemoryCandidateRisk = "low" | "medium" | "high";

export interface MemoryCandidate {
  id: string;
  text: string;
  type: MemoryType;
  suggestedScope: MemoryScope;
  reason: string;
  confidence: number;
  sourceMessageIds: string[];
  risk: MemoryCandidateRisk;
}

export interface MemoryCitation {
  id: string;
  memoryId: string;
  sessionId: string;
  injectedAt: string;
  reason: string;
  score: number;
}

export interface MemoryAuditEvent {
  id: string;
  memoryId: string;
  action: "extract" | "block" | "archive" | "refresh" | "merge" | "promote" | "delete" | "stale";
  detail: string;
  createdAt: string;
}

export type MemoryContextItemMetadata = JsonObject & {
  memoryId: string;
  scope: MemoryScope;
  type: MemoryType;
  citationId: string;
  score: number;
  retrievalReason: string;
  storePath: string;
  projectPath: string | null;
  sourceSessionId: string | null;
};
