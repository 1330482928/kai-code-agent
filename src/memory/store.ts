import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  isMemoryVisible,
  scoreMemoryRecords,
  createMemoryVisibilityContext,
} from "./retrieval.js";
import type {
  CreateMemoryInput,
  MemoryAuditEvent,
  MemoryCitation,
  MemoryListInput,
  MemoryRecord,
  MemorySearchInput,
  MemorySearchResult,
  MemoryScope,
  MemoryStatus,
  MemoryType,
} from "./types.js";

const MEMORY_SCOPES: MemoryScope[] = ["session", "projectLocal", "project", "user"];
const MEMORY_TYPES: MemoryType[] = ["preference", "fact", "decision", "project", "reference"];
const MEMORY_STATUSES: MemoryStatus[] = ["active", "stale", "archived"];

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

const FALLBACK_MEMORY_DATABASES = new Map<string, MemoryRow[]>();
const FALLBACK_MEMORY_CITATIONS = new Map<string, CitationRow[]>();
const FALLBACK_MEMORY_EVENTS = new Map<string, MemoryEventRow[]>();

interface MemoryRow {
  id: string;
  scope: MemoryScope;
  type: MemoryType;
  status: MemoryStatus;
  text: string;
  project_identity: string | null;
  project_cwd: string | null;
  project_path: string | null;
  source_session_id: string | null;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CitationRow {
  id: string;
  memory_id: string;
  session_id: string;
  injected_at: string;
  reason: string;
  score: number;
}

interface MemoryEventRow {
  id: string;
  memory_id: string;
  action: MemoryAuditEvent["action"];
  detail: string;
  created_at: string;
}

export interface OpenMemoryStoreOptions {
  cwd?: string;
  sessionId?: string;
}

export async function openSqliteMemoryStore(databasePath: string): Promise<SqliteMemoryStore> {
  if (databasePath !== ":memory:") {
    await mkdir(path.dirname(databasePath), { recursive: true });
  }
  try {
    const sqlite = await import("bun:sqlite") as BunSqliteModule;
    return new SqliteMemoryStore(new sqlite.Database(databasePath, { create: true }), databasePath);
  } catch {
    return new SqliteMemoryStore(createFallbackMemoryDatabase(databasePath), databasePath);
  }
}

export class SqliteMemoryStore {
  constructor(
    private readonly db: DatabaseLike,
    readonly databasePath: string,
  ) {
    this.db.exec(MEMORY_SCHEMA_SQL);
    this.migrateSchemaIfNeeded();
  }

  add(input: CreateMemoryInput): MemoryRecord {
    validateMemoryCreateInput(input);
    const createdAt = input.createdAt ?? new Date().toISOString();
    const updatedAt = input.updatedAt ?? createdAt;
    const status = input.status ?? "active";
    const record: MemoryRecord = {
      id: input.id ?? `mem_${randomUUID()}`,
      scope: input.scope,
      type: input.type,
      status,
      text: input.text.trim(),
      ...(input.projectIdentity ? { projectIdentity: normalizeProjectPath(input.projectIdentity) } : {}),
      ...(input.projectCwd ? { projectCwd: normalizeProjectPath(input.projectCwd) } : {}),
      ...(input.projectPath ? { projectPath: normalizeProjectPath(input.projectPath) } : {}),
      ...(input.sourceSessionId ? { sourceSessionId: input.sourceSessionId } : {}),
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      createdAt,
      updatedAt,
    };

    this.db.query(`
      INSERT INTO memories (
        id, scope, type, status, text, project_identity, project_cwd, project_path, source_session_id, source_message_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.scope,
      record.type,
      record.status,
      record.text,
      record.projectIdentity ?? null,
      record.projectCwd ?? null,
      record.projectPath ?? null,
      record.sourceSessionId ?? null,
      record.sourceMessageId ?? null,
      record.createdAt,
      record.updatedAt,
    );

    return record;
  }

  list(input: MemoryListInput = {}): MemoryRecord[] {
    const rows = this.db.query(`
      SELECT * FROM memories
      ORDER BY updated_at DESC, created_at DESC, id ASC
    `).all() as MemoryRow[];
    return filterMemoryRows(rows, input);
  }

  search(input: MemorySearchInput): MemorySearchResult[] {
    const visible = this.list({
      scope: input.scope,
      type: input.type,
      visibility: input.visibility,
    });
    const results = scoreMemoryRecords(visible, input.query, input.now);
    return results.slice(0, input.limit ?? results.length);
  }

  delete(id: string): MemoryRecord | undefined {
    const existing = this.get(id);
    if (!existing) {
      return undefined;
    }
    this.db.query("DELETE FROM memories WHERE id = ?").run(id);
    return existing;
  }

  setStatus(id: string, status: MemoryStatus): MemoryRecord | undefined {
    const existing = this.get(id);
    if (!existing) {
      return undefined;
    }
    const updatedAt = new Date().toISOString();
    this.db.query("UPDATE memories SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, id);
    return { ...existing, status, updatedAt };
  }

  updateText(id: string, text: string): MemoryRecord | undefined {
    const existing = this.get(id);
    if (!existing) {
      return undefined;
    }
    const updatedAt = new Date().toISOString();
    this.db.query("UPDATE memories SET text = ?, updated_at = ? WHERE id = ?").run(text, updatedAt, id);
    return { ...existing, text, updatedAt };
  }

  updateScope(
    id: string,
    input: {
      scope: MemoryScope;
      projectIdentity?: string;
      projectCwd?: string;
      projectPath?: string;
      sourceSessionId?: string;
      sourceMessageId?: string;
    },
  ): MemoryRecord | undefined {
    const existing = this.get(id);
    if (!existing) {
      return undefined;
    }
    const updatedAt = new Date().toISOString();
    this.db.query(`
      UPDATE memories
      SET scope = ?, project_identity = ?, project_cwd = ?, project_path = ?, source_session_id = ?, source_message_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.scope,
      input.projectIdentity ?? null,
      input.projectCwd ?? null,
      input.projectPath ?? null,
      input.sourceSessionId ?? null,
      input.sourceMessageId ?? null,
      updatedAt,
      id,
    );
    return {
      ...existing,
      scope: input.scope,
      ...(input.projectIdentity ? { projectIdentity: normalizeProjectPath(input.projectIdentity) } : {}),
      ...(input.projectCwd ? { projectCwd: normalizeProjectPath(input.projectCwd) } : {}),
      ...(input.projectPath ? { projectPath: normalizeProjectPath(input.projectPath) } : {}),
      ...(input.sourceSessionId ? { sourceSessionId: input.sourceSessionId } : {}),
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      updatedAt,
    };
  }

  merge(primaryId: string, duplicateIds: string[]): MemoryRecord | undefined {
    const primary = this.get(primaryId);
    if (!primary) {
      return undefined;
    }
    const duplicates = duplicateIds
      .map((id) => this.get(id))
      .filter((record): record is MemoryRecord => record !== undefined && record.id !== primaryId);
    const mergedText = [primary.text, ...duplicates.map((record) => record.text)].join("\n").trim();
    const updated = this.updateText(primaryId, mergedText) ?? primary;
    for (const duplicate of duplicates) {
      this.delete(duplicate.id);
    }
    return updated;
  }

  get(id: string): MemoryRecord | undefined {
    const row = this.db.query("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow | undefined;
    return row ? recordFromRow(row) : undefined;
  }

  close(): void {
    this.db.close();
  }

  recordCitation(input: {
    memoryId: string;
    sessionId: string;
    injectedAt: string;
    reason: string;
    score: number;
  }): MemoryCitation {
    const citation: MemoryCitation = {
      id: `memcite_${randomUUID()}`,
      ...input,
    };
    this.db.query(`
      INSERT INTO memory_citations (
        id, memory_id, session_id, injected_at, reason, score
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      citation.id,
      citation.memoryId,
      citation.sessionId,
      citation.injectedAt,
      citation.reason,
      citation.score,
    );
    return citation;
  }

  listCitations(sessionId?: string): MemoryCitation[] {
    const rows = sessionId
      ? this.db.query("SELECT * FROM memory_citations WHERE session_id = ? ORDER BY injected_at DESC, id ASC").all(sessionId) as CitationRow[]
      : this.db.query("SELECT * FROM memory_citations ORDER BY injected_at DESC, id ASC").all() as CitationRow[];
    return rows.map((row) => ({
      id: row.id,
      memoryId: row.memory_id,
      sessionId: row.session_id,
      injectedAt: row.injected_at,
      reason: row.reason,
      score: row.score,
    }));
  }

  recordEvent(input: {
    memoryId: string;
    action: MemoryAuditEvent["action"];
    detail: string;
    createdAt?: string;
  }): MemoryAuditEvent {
    const event: MemoryAuditEvent = {
      id: `memevt_${randomUUID()}`,
      memoryId: input.memoryId,
      action: input.action,
      detail: input.detail,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.db.query(`
      INSERT INTO memory_events (
        id, memory_id, action, detail, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.memoryId,
      event.action,
      event.detail,
      event.createdAt,
    );
    return event;
  }

  listEvents(memoryId?: string): MemoryAuditEvent[] {
    const rows = memoryId
      ? this.db.query("SELECT * FROM memory_events WHERE memory_id = ? ORDER BY created_at DESC, id ASC").all(memoryId) as MemoryEventRow[]
      : this.db.query("SELECT * FROM memory_events ORDER BY created_at DESC, id ASC").all() as MemoryEventRow[];
    return rows.map((row) => ({
      id: row.id,
      memoryId: row.memory_id,
      action: row.action,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  }

  findVisible(input: MemoryListInput & { query?: string }): MemoryRecord[] {
    return this.list(input);
  }

  private migrateSchemaIfNeeded(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_citations (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        injected_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        score INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_citations_session
        ON memory_citations(session_id, injected_at DESC);
      CREATE TABLE IF NOT EXISTS memory_events (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_events_memory
        ON memory_events(memory_id, created_at DESC);
    `);
    try {
      const columns = this.db.query("PRAGMA table_info(memories)").all() as Array<{ name?: string }>;
      if (!columns.some((column) => column.name === "status")) {
        this.db.exec("ALTER TABLE memories ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
      }
    } catch {
      // Older or fallback databases may not support PRAGMA inspection; keep best-effort compatibility.
    }
  }
}

export function buildMemoryVisibilityContext(
  input: OpenMemoryStoreOptions & { cwd: string },
): ReturnType<typeof createMemoryVisibilityContext> {
  return createMemoryVisibilityContext({
    cwd: input.cwd,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });
}

function filterMemoryRows(rows: MemoryRow[], input: MemoryListInput): MemoryRecord[] {
  const records = rows.map(recordFromRow);
  return records.filter((record) => {
    if (input.scope && record.scope !== input.scope) {
      return false;
    }
    if (input.type && record.type !== input.type) {
      return false;
    }
    if (record.status !== "active") {
      return false;
    }
    return isMemoryVisible(record, input.visibility);
  });
}

function recordFromRow(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    scope: row.scope,
    type: row.type,
    status: row.status ?? "active",
    text: row.text,
    ...(row.project_identity ? { projectIdentity: row.project_identity } : {}),
    ...(row.project_cwd ? { projectCwd: row.project_cwd } : {}),
    ...(row.project_path ? { projectPath: row.project_path } : {}),
    ...(row.source_session_id ? { sourceSessionId: row.source_session_id } : {}),
    ...(row.source_message_id ? { sourceMessageId: row.source_message_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateMemoryCreateInput(input: CreateMemoryInput): void {
  if (!MEMORY_SCOPES.includes(input.scope)) {
    throw new Error(`Unsupported memory scope '${input.scope}'`);
  }
  if (!MEMORY_TYPES.includes(input.type)) {
    throw new Error(`Unsupported memory type '${input.type}'`);
  }
  if (input.status !== undefined && !MEMORY_STATUSES.includes(input.status)) {
    throw new Error(`Unsupported memory status '${input.status}'`);
  }
  if (!input.text || !input.text.trim()) {
    throw new Error("Memory text is required");
  }

  if ((input.scope === "project" || input.scope === "projectLocal") && !hasAnyProjectKey(input)) {
    throw new Error("Project memory requires project identity metadata");
  }
  if (input.scope === "session" && !input.sourceSessionId) {
    throw new Error("Session memory requires sourceSessionId");
  }
}

function hasAnyProjectKey(input: CreateMemoryInput): boolean {
  return Boolean(input.projectIdentity || input.projectCwd || input.projectPath);
}

function normalizeProjectPath(value: string): string {
  return path.resolve(value);
}

export const MEMORY_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_metadata (key, value)
VALUES ('memory_schema_version', '1');

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('session', 'projectLocal', 'project', 'user')),
  type TEXT NOT NULL CHECK (type IN ('preference', 'fact', 'decision', 'project', 'reference')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale', 'archived')),
  text TEXT NOT NULL,
  project_identity TEXT,
  project_cwd TEXT,
  project_path TEXT,
  source_session_id TEXT,
  source_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_scope_updated
  ON memories(scope, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_project_path
  ON memories(project_path, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_session
  ON memories(source_session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS memory_citations (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  injected_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  score INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_citations_session
  ON memory_citations(session_id, injected_at DESC);
`;

function createFallbackMemoryDatabase(databasePath: string): DatabaseLike {
  const rows = FALLBACK_MEMORY_DATABASES.get(databasePath) ?? [];
  FALLBACK_MEMORY_DATABASES.set(databasePath, rows);
  const citations = FALLBACK_MEMORY_CITATIONS.get(databasePath) ?? [];
  FALLBACK_MEMORY_CITATIONS.set(databasePath, citations);
  const events = FALLBACK_MEMORY_EVENTS.get(databasePath) ?? [];
  FALLBACK_MEMORY_EVENTS.set(databasePath, events);

  return {
    exec(_sql: string): void {
      return;
    },
    query(sql: string): StatementLike {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.startsWith("insert into memories")) {
        return {
          run(...params: unknown[]): unknown {
            const row = rowFromInsert(params);
            const index = rows.findIndex((candidate) => candidate.id === row.id);
            if (index >= 0) {
              rows[index] = row;
            } else {
              rows.push(row);
            }
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(): unknown[] {
            return [];
          },
        };
      }

      if (normalized.startsWith("insert into memory_citations")) {
        return {
          run(...params: unknown[]): unknown {
            const row = citationRowFromInsert(params);
            const index = citations.findIndex((candidate) => candidate.id === row.id);
            if (index >= 0) {
              citations[index] = row;
            } else {
              citations.push(row);
            }
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(): unknown[] {
            return [];
          },
        };
      }

      if (normalized.startsWith("insert into memory_events")) {
        return {
          run(...params: unknown[]): unknown {
            const row = eventRowFromInsert(params);
            const index = events.findIndex((candidate) => candidate.id === row.id);
            if (index >= 0) {
              events[index] = row;
            } else {
              events.push(row);
            }
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(): unknown[] {
            return [];
          },
        };
      }

      if (normalized.startsWith("select * from memories where id = ?")) {
        return {
          run(): unknown {
            return undefined;
          },
          get(id: unknown): unknown {
            return cloneRow(rows.find((row) => row.id === String(id)));
          },
          all(): unknown[] {
            return [];
          },
        };
      }

      if (normalized.startsWith("delete from memories where id = ?")) {
        return {
          run(id: unknown): unknown {
            const index = rows.findIndex((row) => row.id === String(id));
            if (index >= 0) {
              rows.splice(index, 1);
            }
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(): unknown[] {
            return [];
          },
        };
      }

      if (normalized.startsWith("update memories set status = ?, updated_at = ? where id = ?")) {
        return {
          run(status: unknown, updatedAt: unknown, id: unknown): unknown {
            const row = rows.find((candidate) => candidate.id === String(id));
            if (row) {
              row.status = status as MemoryStatus;
              row.updated_at = String(updatedAt);
            }
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(): unknown[] {
            return [];
          },
        };
      }

      if (normalized.startsWith("update memories set text = ?, updated_at = ? where id = ?")) {
        return {
          run(text: unknown, updatedAt: unknown, id: unknown): unknown {
            const row = rows.find((candidate) => candidate.id === String(id));
            if (row) {
              row.text = String(text);
              row.updated_at = String(updatedAt);
            }
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(): unknown[] {
            return [];
          },
        };
      }

      if (normalized.startsWith("update memories set scope = ?, project_identity = ?, project_cwd = ?, project_path = ?, source_session_id = ?, source_message_id = ?, updated_at = ? where id = ?")) {
        return {
          run(scope: unknown, projectIdentity: unknown, projectCwd: unknown, projectPath: unknown, sourceSessionId: unknown, sourceMessageId: unknown, updatedAt: unknown, id: unknown): unknown {
            const row = rows.find((candidate) => candidate.id === String(id));
            if (row) {
              row.scope = scope as MemoryScope;
              row.project_identity = projectIdentity === null || projectIdentity === undefined ? null : String(projectIdentity);
              row.project_cwd = projectCwd === null || projectCwd === undefined ? null : String(projectCwd);
              row.project_path = projectPath === null || projectPath === undefined ? null : String(projectPath);
              row.source_session_id = sourceSessionId === null || sourceSessionId === undefined ? null : String(sourceSessionId);
              row.source_message_id = sourceMessageId === null || sourceMessageId === undefined ? null : String(sourceMessageId);
              row.updated_at = String(updatedAt);
            }
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(): unknown[] {
            return [];
          },
        };
      }

      if (normalized.startsWith("select * from memories order by updated_at desc, created_at desc, id asc")) {
        return {
          run(): unknown {
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(): unknown[] {
            return [...rows]
              .sort(compareMemoryRows)
              .map(cloneRow);
          },
        };
      }

      if (normalized.startsWith("select * from memory_citations where session_id = ? order by injected_at desc, id asc")) {
        return {
          run(): unknown {
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(sessionId: unknown): unknown[] {
            return [...citations]
              .filter((row) => row.session_id === String(sessionId))
              .sort(compareCitationRows)
              .map(cloneCitationRow);
          },
        };
      }

      if (normalized.startsWith("select * from memory_citations order by injected_at desc, id asc")) {
        return {
          run(): unknown {
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(): unknown[] {
            return [...citations]
              .sort(compareCitationRows)
              .map(cloneCitationRow);
          },
        };
      }

      if (normalized.startsWith("select * from memory_events where memory_id = ? order by created_at desc, id asc")) {
        return {
          run(): unknown {
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(memoryId: unknown): unknown[] {
            return [...events]
              .filter((row) => row.memory_id === String(memoryId))
              .sort(compareEventRows)
              .map(cloneEventRow);
          },
        };
      }

      if (normalized.startsWith("select * from memory_events order by created_at desc, id asc")) {
        return {
          run(): unknown {
            return undefined;
          },
          get(): unknown {
            return undefined;
          },
          all(): unknown[] {
            return [...events]
              .sort(compareEventRows)
              .map(cloneEventRow);
          },
        };
      }

      throw new Error(`Unsupported fallback memory query: ${sql}`);
    },
    close(): void {
      return;
    },
  };
}

function rowFromInsert(params: unknown[]): MemoryRow {
  const [id, scope, type, status, text, projectIdentity, projectCwd, projectPath, sourceSessionId, sourceMessageId, createdAt, updatedAt] = params;
  return {
    id: String(id),
    scope: scope as MemoryScope,
    type: type as MemoryType,
    status: (status as MemoryStatus) ?? "active",
    text: String(text),
    project_identity: projectIdentity === null || projectIdentity === undefined ? null : String(projectIdentity),
    project_cwd: projectCwd === null || projectCwd === undefined ? null : String(projectCwd),
    project_path: projectPath === null || projectPath === undefined ? null : String(projectPath),
    source_session_id: sourceSessionId === null || sourceSessionId === undefined ? null : String(sourceSessionId),
    source_message_id: sourceMessageId === null || sourceMessageId === undefined ? null : String(sourceMessageId),
    created_at: String(createdAt),
    updated_at: String(updatedAt),
  };
}

function eventRowFromInsert(params: unknown[]): MemoryEventRow {
  const [id, memoryId, action, detail, createdAt] = params;
  return {
    id: String(id),
    memory_id: String(memoryId),
    action: action as MemoryAuditEvent["action"],
    detail: String(detail),
    created_at: String(createdAt),
  };
}

function citationRowFromInsert(params: unknown[]): CitationRow {
  const [id, memoryId, sessionId, injectedAt, reason, score] = params;
  return {
    id: String(id),
    memory_id: String(memoryId),
    session_id: String(sessionId),
    injected_at: String(injectedAt),
    reason: String(reason),
    score: Number(score),
  };
}

function compareMemoryRows(a: MemoryRow, b: MemoryRow): number {
  if (a.updated_at !== b.updated_at) {
    return b.updated_at.localeCompare(a.updated_at);
  }
  if (a.created_at !== b.created_at) {
    return b.created_at.localeCompare(a.created_at);
  }
  return a.id.localeCompare(b.id);
}

function cloneRow(row: MemoryRow | undefined): MemoryRow | undefined {
  if (!row) {
    return undefined;
  }
  return { ...row };
}

function compareCitationRows(a: CitationRow, b: CitationRow): number {
  if (a.injected_at !== b.injected_at) {
    return b.injected_at.localeCompare(a.injected_at);
  }
  return a.id.localeCompare(b.id);
}

function cloneCitationRow(row: CitationRow | undefined): CitationRow | undefined {
  if (!row) {
    return undefined;
  }
  return { ...row };
}

function compareEventRows(a: MemoryEventRow, b: MemoryEventRow): number {
  if (a.created_at !== b.created_at) {
    return b.created_at.localeCompare(a.created_at);
  }
  return a.id.localeCompare(b.id);
}

function cloneEventRow(row: MemoryEventRow | undefined): MemoryEventRow | undefined {
  if (!row) {
    return undefined;
  }
  return { ...row };
}
