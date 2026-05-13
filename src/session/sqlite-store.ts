import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { ExecutableToolUse, JsonObject, ToolResult } from "../foundation/tool.js";
import { summarizeToolUse } from "../foundation/tool-summary.js";

import { SESSION_SCHEMA_SQL } from "./schema.js";
import type {
  AppendMessageInput,
  AppendPartInput,
  BashRunMetadata,
  LoadedSession,
  RecordCompactionSummaryInput,
  RecordCompactionSummaryResult,
  RecordAssistantMessageInput,
  RecordToolResultInput,
  RecordUserMessageInput,
  SessionMessageRole,
  SessionPartType,
  SessionRecord,
  SessionRecorder,
  SessionStore,
  SessionSummary,
  TranscriptMessage,
  TranscriptPart,
} from "./types.js";

interface StatementLike {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface DatabaseLike {
  exec(sql: string): void;
  query(sql: string): StatementLike;
  close(): void;
}

interface BunSqliteModule {
  Database: new (filename: string, options?: { create?: boolean }) => DatabaseLike;
}

interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  cwd: string;
  title: string | null;
  metadata_json: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  ordinal: number;
  created_at: string;
  summary: string | null;
  metadata_json: string;
}

interface PartRow {
  id: string;
  message_id: string;
  ordinal: number;
  type: string;
  text: string | null;
  model_content: string | null;
  metadata_json: string;
  created_at: string;
}

interface SessionSummaryRow extends SessionRow {
  message_count: number;
  summary: string | null;
}

export async function openSqliteSessionStore(databasePath: string): Promise<SqliteSessionStore> {
  if (databasePath !== ":memory:") {
    await mkdir(path.dirname(databasePath), { recursive: true });
  }
  const sqlite = await import("bun:sqlite") as BunSqliteModule;
  return new SqliteSessionStore(new sqlite.Database(databasePath, { create: true }), databasePath);
}

export class SqliteSessionStore implements SessionStore {
  constructor(
    private readonly db: DatabaseLike,
    readonly databasePath: string,
  ) {
    this.db.exec(SESSION_SCHEMA_SQL);
  }

  createSession(input: { id?: string; cwd?: string; title?: string; metadata?: JsonObject } = {}): SessionRecord {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: input.id ?? `sess_${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
      cwd: input.cwd ?? process.cwd(),
      ...(input.title ? { title: input.title } : {}),
      metadata: input.metadata ?? {},
    };
    this.db.query(
      "INSERT INTO sessions (id, created_at, updated_at, cwd, title, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      session.id,
      session.createdAt,
      session.updatedAt,
      session.cwd,
      session.title ?? null,
      stringifyJson(session.metadata),
    );
    return session;
  }

  getSession(sessionId: string): SessionRecord | undefined {
    const row = this.db.query("SELECT * FROM sessions WHERE id = ?").get(sessionId) as SessionRow | undefined;
    return row ? sessionFromRow(row) : undefined;
  }

  loadSession(sessionId: string): LoadedSession | undefined {
    const session = this.getSession(sessionId);
    if (!session) {
      return undefined;
    }

    const messageRows = this.db.query(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY ordinal ASC",
    ).all(sessionId) as MessageRow[];
    const messages = messageRows.map((row) => {
      const parts = this.db.query(
        "SELECT * FROM parts WHERE message_id = ? ORDER BY ordinal ASC",
      ).all(row.id) as PartRow[];
      return {
        ...messageFromRow(row),
        parts: parts.map(partFromRow),
      };
    });
    return { session, messages };
  }

  listSessions(): SessionSummary[] {
    const rows = this.db.query(`
      SELECT
        sessions.*,
        COUNT(messages.id) AS message_count,
        COALESCE(sessions.title, (
          SELECT summary FROM messages m
          WHERE m.session_id = sessions.id AND m.summary IS NOT NULL
          ORDER BY m.ordinal ASC LIMIT 1
        )) AS summary
      FROM sessions
      LEFT JOIN messages ON messages.session_id = sessions.id
      GROUP BY sessions.id
      ORDER BY sessions.updated_at DESC
    `).all() as SessionSummaryRow[];
    return rows.map((row) => ({
      ...sessionFromRow(row),
      messageCount: Number(row.message_count ?? 0),
      ...(row.summary ? { summary: row.summary } : {}),
    }));
  }

  appendMessage(input: AppendMessageInput): TranscriptMessage {
    if (!this.getSession(input.sessionId)) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }
    const ordinal = nextOrdinal(
      this.db,
      "SELECT COALESCE(MAX(ordinal), -1) + 1 AS next FROM messages WHERE session_id = ?",
      input.sessionId,
    );
    const createdAt = input.createdAt ?? new Date().toISOString();
    const message: TranscriptMessage = {
      id: input.id ?? `msg_${randomUUID()}`,
      sessionId: input.sessionId,
      role: input.role,
      ordinal,
      createdAt,
      ...(input.summary ? { summary: input.summary } : {}),
      metadata: input.metadata ?? {},
      parts: [],
    };
    this.db.query(
      "INSERT INTO messages (id, session_id, role, ordinal, created_at, summary, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      message.id,
      message.sessionId,
      message.role,
      message.ordinal,
      message.createdAt,
      message.summary ?? null,
      stringifyJson(message.metadata),
    );
    this.touchSession(input.sessionId, createdAt);
    return message;
  }

  appendPart(input: AppendPartInput): TranscriptPart {
    const message = this.getMessage(input.messageId);
    if (!message) {
      throw new Error(`Message not found: ${input.messageId}`);
    }
    const ordinal = nextOrdinal(
      this.db,
      "SELECT COALESCE(MAX(ordinal), -1) + 1 AS next FROM parts WHERE message_id = ?",
      input.messageId,
    );
    const createdAt = input.createdAt ?? new Date().toISOString();
    const part: TranscriptPart = {
      id: input.id ?? `part_${randomUUID()}`,
      messageId: input.messageId,
      ordinal,
      type: input.type,
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.modelContent !== undefined ? { modelContent: input.modelContent } : {}),
      metadata: input.metadata ?? {},
      createdAt,
    };
    this.db.query(
      "INSERT INTO parts (id, message_id, ordinal, type, text, model_content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      part.id,
      part.messageId,
      part.ordinal,
      part.type,
      part.text ?? null,
      part.modelContent ?? null,
      stringifyJson(part.metadata),
      part.createdAt,
    );
    this.touchSession(message.sessionId, createdAt);
    return part;
  }

  createRecorder(sessionId: string): SessionTranscriptRecorder {
    return new SessionTranscriptRecorder(this, sessionId);
  }

  close(): void {
    this.db.close();
  }

  private getMessage(messageId: string): TranscriptMessage | undefined {
    const row = this.db.query("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    return row ? messageFromRow(row) : undefined;
  }

  private touchSession(sessionId: string, updatedAt: string): void {
    this.db.query("UPDATE sessions SET updated_at = ? WHERE id = ?").run(updatedAt, sessionId);
  }
}

export class SessionTranscriptRecorder implements SessionRecorder {
  constructor(
    private readonly store: SessionStore,
    private readonly sessionId: string,
  ) {}

  recordUserMessage(input: RecordUserMessageInput): void {
    const metadata: JsonObject = {
      ...(input.submission?.metadata ? { submission: input.submission.metadata as JsonObject } : {}),
      ...(input.profile ? { profile: input.profile } : {}),
      ...(input.requestedProfile ? { requestedProfile: input.requestedProfile } : {}),
    };
    const message = this.store.appendMessage({
      sessionId: this.sessionId,
      role: "user",
      summary: summarizeText(input.task),
      metadata,
    });
    this.store.appendPart({
      messageId: message.id,
      type: "text",
      text: input.task,
      metadata,
    });
  }

  recordAssistantMessage(input: RecordAssistantMessageInput): void {
    const summary = input.text.trim() ? summarizeText(input.text) : summarizeToolCalls(input.toolCalls);
    const message = this.store.appendMessage({
      sessionId: this.sessionId,
      role: "assistant",
      summary,
    });
    for (const thinking of input.thinking) {
      if (thinking.length > 0) {
        this.store.appendPart({
          messageId: message.id,
          type: "thinking",
          text: thinking,
          metadata: { hidden: true },
        });
      }
    }
    if (input.text.length > 0) {
      this.store.appendPart({
        messageId: message.id,
        type: "text",
        text: input.text,
      });
    }
    for (const toolCall of input.toolCalls) {
      this.store.appendPart({
        messageId: message.id,
        type: "tool_call",
        text: summarizeToolUse(toolCall).detail ?? toolCall.name,
        metadata: toolCallMetadata(toolCall),
      });
    }
  }

  recordToolResult(input: RecordToolResultInput): void {
    const bash = deriveBashMetadata(input);
    const plan = isJsonObject(input.rawResult.metadata?.plan) ? input.rawResult.metadata.plan : undefined;
    const ok = input.rawResult.ok;
    const message = this.store.appendMessage({
      sessionId: this.sessionId,
      role: "tool",
      summary: summarizeToolResult(input.rawResult),
      metadata: {
        toolCallId: input.toolUse.id,
        name: input.toolUse.name,
        ok,
        ...(input.profile ? { profile: input.profile } : {}),
        ...(plan ? { plan } : {}),
        ...planMetadata(plan),
      },
    });
    this.store.appendPart({
      messageId: message.id,
      type: plan ? "summary" : "tool_result",
      text: summarizeToolResult(input.rawResult),
      modelContent: input.modelContent,
      metadata: {
        toolCallId: input.toolUse.id,
        name: input.toolUse.name,
        ok,
        ...(input.profile ? { profile: input.profile } : {}),
        ...(plan ? { kind: "plan", plan } : {}),
        ...planMetadata(plan),
        ...(input.rawResult.error ? { error: input.rawResult.error as unknown as JsonObject } : {}),
        ...(bash ? { bash: bash as unknown as JsonObject } : {}),
      },
    });
  }

  recordCompactionSummary(input: RecordCompactionSummaryInput): RecordCompactionSummaryResult {
    const existing = findExistingCompactionSummary(this.store.loadSession(this.sessionId), input);
    if (existing) {
      return {
        messageId: existing.messageId,
        partId: existing.partId,
        reused: true,
      };
    }

    const metadata: JsonObject = {
      kind: "compaction",
      sourceMessageIds: input.sourceMessageIds,
      preservedMessageIds: input.preservedMessageIds,
      ...(input.compactedItemIds ? { compactedItemIds: input.compactedItemIds } : {}),
      ...(input.preservedItemIds ? { preservedItemIds: input.preservedItemIds } : {}),
      ...(input.profile ? { profile: input.profile } : {}),
      ...(input.estimatedTokens !== undefined ? { estimatedTokens: input.estimatedTokens } : {}),
    };
    const message = this.store.appendMessage({
      sessionId: this.sessionId,
      role: "tool",
      summary: "context compacted",
      metadata,
    });
    const part = this.store.appendPart({
      messageId: message.id,
      type: "summary",
      text: input.summary,
      modelContent: input.summary,
      metadata,
    });
    return {
      messageId: message.id,
      partId: part.id,
      reused: false,
    };
  }

  completeTurn(): void {
    return undefined;
  }
}

function planMetadata(plan: JsonObject | undefined): JsonObject {
  if (!plan) {
    return {};
  }
  return {
    kind: "plan",
    status: typeof plan.status === "string" ? plan.status : "",
    ...(typeof plan.planPath === "string" ? { planPath: plan.planPath, activePlanPath: plan.planPath } : {}),
    ...(typeof plan.preview === "string" ? { preview: plan.preview } : {}),
    ...(typeof plan.approvedPlan === "string" ? { approvedPlan: plan.approvedPlan } : {}),
    ...(typeof plan.nextProfile === "string" ? { nextProfile: plan.nextProfile } : {}),
  };
}

function toolCallMetadata(toolCall: ExecutableToolUse): JsonObject {
  const summary = summarizeToolUse(toolCall);
  return {
    toolCallId: toolCall.id,
    name: toolCall.name,
    input: toolCall.input,
    summary: {
      title: summary.title,
      ...(summary.detail ? { detail: summary.detail } : {}),
    },
  };
}

function deriveBashMetadata(input: RecordToolResultInput): BashRunMetadata | undefined {
  if (input.toolUse.name !== "bash") {
    return undefined;
  }
  const bash = isJsonObject(input.rawResult.metadata?.bash) ? input.rawResult.metadata.bash : {};
  const stdoutPreview = typeof bash.stdoutPreview === "string" ? bash.stdoutPreview : "";
  const stderrPreview = typeof bash.stderrPreview === "string" ? bash.stderrPreview : "";
  const preview = [stdoutPreview, stderrPreview].filter(Boolean).join("\n");
  const exitCode = typeof bash.exitCode === "number" ? bash.exitCode : null;
  const outputBytes = typeof bash.outputBytes === "number"
    ? bash.outputBytes
    : Buffer.byteLength(input.rawResult.output);
  return {
    command: typeof input.toolUse.input.command === "string"
      ? input.toolUse.input.command
      : typeof bash.command === "string"
        ? bash.command
        : "",
    cwd: input.cwd,
    exitCode,
    interrupted: bash.interrupted === true,
    preview: preview || summarizeText(input.rawResult.output, 400),
    bytes: outputBytes,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  };
}

function sessionFromRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cwd: row.cwd,
    ...(row.title ? { title: row.title } : {}),
    metadata: parseJsonObject(row.metadata_json),
  };
}

function messageFromRow(row: MessageRow): TranscriptMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: parseRole(row.role),
    ordinal: row.ordinal,
    createdAt: row.created_at,
    ...(row.summary ? { summary: row.summary } : {}),
    metadata: parseJsonObject(row.metadata_json),
    parts: [],
  };
}

function partFromRow(row: PartRow): TranscriptPart {
  return {
    id: row.id,
    messageId: row.message_id,
    ordinal: row.ordinal,
    type: parsePartType(row.type),
    ...(row.text !== null ? { text: row.text } : {}),
    ...(row.model_content !== null ? { modelContent: row.model_content } : {}),
    metadata: parseJsonObject(row.metadata_json),
    createdAt: row.created_at,
  };
}

function parseRole(role: string): SessionMessageRole {
  if (role === "user" || role === "assistant" || role === "tool") {
    return role;
  }
  throw new Error(`Invalid session message role in database: ${role}`);
}

function parsePartType(type: string): SessionPartType {
  if (type === "text" || type === "thinking" || type === "tool_call" || type === "tool_result" || type === "summary") {
    return type;
  }
  throw new Error(`Invalid transcript part type in database: ${type}`);
}

function parseJsonObject(text: string): JsonObject {
  const parsed = JSON.parse(text) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error("Expected JSON object in transcript metadata");
  }
  return parsed;
}

function stringifyJson(value: JsonObject): string {
  return JSON.stringify(value);
}

function nextOrdinal(db: DatabaseLike, query: string, id: string): number {
  const row = db.query(query).get(id) as { next?: number } | undefined;
  return Number(row?.next ?? 0);
}

function summarizeText(text: string, limit = 80): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, limit - 3)}...`;
}

function summarizeToolCalls(toolCalls: ExecutableToolUse[]): string {
  if (toolCalls.length === 0) {
    return "assistant";
  }
  return toolCalls.map((toolCall) => summarizeToolUse(toolCall).title).join(", ");
}

function summarizeToolResult(result: ToolResult): string {
  if (result.error) {
    return result.error.message;
  }
  return summarizeText(result.output, 160);
}

function findExistingCompactionSummary(
  loaded: LoadedSession | undefined,
  input: RecordCompactionSummaryInput,
): { messageId: string; partId: string } | undefined {
  if (!loaded) {
    return undefined;
  }
  for (const message of loaded.messages) {
    for (const part of message.parts) {
      if (part.type !== "summary" || part.metadata.kind !== "compaction") {
        continue;
      }
      const sourceMessageIds = stringArrayMetadata(part.metadata.sourceMessageIds);
      const preservedMessageIds = stringArrayMetadata(part.metadata.preservedMessageIds);
      if (
        sameStringArray(sourceMessageIds, input.sourceMessageIds) &&
        sameStringArray(preservedMessageIds, input.preservedMessageIds)
      ) {
        return { messageId: message.id, partId: part.id };
      }
    }
  }
  return undefined;
}

function stringArrayMetadata(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
