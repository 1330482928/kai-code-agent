## Context

Kai now has the relevant primitives for a conservative Memory v0:

- `ContextItem(kind="memory")` is already part of the context kernel contract.
- `ModelInputBuilder` is the provider-input boundary.
- Middleware can contribute ContextItems before model input assembly.
- The CLI already has scriptable subcommands for sessions, MCP, prompt debug, plans, and skills.
- SQLite is already used for local session persistence and deterministic tests.

Stage 10B should introduce manual memory only. The full memory system remains Stage 13 and will add extraction, citations, lifecycle, secret guard, policy, and richer retrieval.

## Decisions

### 1. Use explicit manual writes only

Memory v0 writes happen only through `kai memory add`. The run loop will not infer or extract memory from conversation turns. This keeps privacy and correctness risks low while giving users a usable persistence primitive.

### 2. Keep the v0 record schema small

The v0 record stores:

```ts
export type MemoryScope = "session" | "projectLocal" | "project" | "user";
export type MemoryType = "preference" | "fact" | "decision" | "project" | "reference";

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  type: MemoryType;
  text: string;
  projectPath?: string;
  sourceSessionId?: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
}
```

No `status`, citations, confidence, expiry, stale/archive state, merge metadata, or extracted-source fields are required in 10B.

### 3. Store records in local SQLite with path injection

Add a memory store backed by `bun:sqlite`, with a default user-local path such as `~/.kai-code-agent/memory.sqlite` and a `KAI_MEMORY_DB_PATH`/test option override. The store should be deterministic and closeable like the session store. Every non-user record must carry enough scope key data to support filtering and output: project and projectLocal records must retain the current project identity fields used at write time, and session records must retain `sourceSessionId`. These scope keys are stored in SQLite regardless of whether the database path is user-local or project-local. `projectLocal` must not require a repo-tracked file in 10B.

### 4. CLI commands are scriptable and bounded

The CLI should support:

```bash
kai memory add --scope user --type preference "Prefer concise final answers"
kai memory list [--scope user] [--type preference]
kai memory search concise [--scope user] [--limit 5]
kai memory delete <id>
```

Output should be concise, tabular where practical, and should include ids, scope, type, timestamps, and bounded text. Invalid scope/type/subcommand input should fail with a concise usage error and should not start a provider request.

### 5. Retrieval is keyword plus recency

Memory v0 retrieval should score records using simple token overlap with the current task plus a small recency boost. It should support a deterministic limit and return score metadata/reasons for tests and prompt debug. Semantic/vector retrieval is out of scope.

Retrieval must filter by scope visibility before scoring. `user` records are globally visible. `project` and `projectLocal` records are visible only when the current project identity matches the record's stored project identity / cwd / projectPath binding. `session` records are visible only when `sourceSessionId` matches the active session. Mismatched records must not appear in list, search, or retrieval output.

### 6. Middleware injects memory through ContextItems

Memory middleware should run before provider input assembly, retrieve top relevant manual records for the current task, and contribute `ContextItem(kind="memory")` values. Metadata should include memory id, scope, type, score, source path/store, and retrieval reason. It must not hand-write provider messages or alter tool permissions.

Middleware must only inject records that are visible in the current run. Invisible project or session memories must be filtered out before the ContextItem list is assembled.

### 7. No safety or lifecycle policy in 10B

The absence of secret guard and lifecycle policy is intentional and bounded by manual-only writes. Documentation, CLI help, and tests should keep 10B from accidentally introducing automatic extraction, stale/archive/merge, citations, or permission decisions.

## Tradeoffs

- Compared with Claude-style post-turn memory extraction, manual-only memory is less convenient but avoids unreviewed long-term writes before policy and secret guard exist.
- Compared with Codex-style citation-aware memory, v0 is less auditable but keeps the stage small; citation storage belongs with Stage 13.
- Compared with OpenCode-style file/instruction context, SQLite records are easier to search/delete from CLI and avoid mixing memory with project instructions.

## Implementation Shape

Planned modules:

- `src/memory/types.ts`: scope/type schemas and record/retrieval types.
- `src/memory/store.ts`: SQLite schema and CRUD/list/search primitives.
- `src/memory/retrieval.ts`: keyword/recency scoring and top-k selection.
- `src/memory/middleware.ts`: ContextItem production for relevant memories.
- `src/memory/index.ts`: exports.
- `src/cli/main.ts`: `kai memory` command dispatch.
- `src/index.ts`: test-facing exports.
- `tests/stage-10b-memory.test.ts` or equivalent focused tests.

## Testing Strategy

- Unit-test scope/type validation and deterministic record ids/timestamps through dependency injection.
- Unit-test store add/list/search/delete with an in-memory or temp SQLite database.
- Unit-test retrieval ordering by keyword overlap and recency.
- Test CLI `kai memory add/list/search/delete` with temp DB path injection.
- Test memory middleware produces `ContextItem(kind="memory")` and provider input receives it only through `ModelInputBuilder`.
- Run `openspec validate stage-10b-memory-v0 --strict`, `bun run check`, focused Stage 10B tests, related context/run-loop tests, and full `bun run test` before archive.

## Risks / Open Questions

- The exact default memory DB path should match existing Kai path conventions and must be overrideable in tests.
- `session` scope can carry optional `sourceSessionId` in v0, but no automatic transcript linkage should be implied.
- Project-scoped records need a stable project identity; v0 can use cwd/project path metadata and defer shared/team semantics.
