## 1. Memory v0 Types and Store

- [x] 1.1 Add `src/memory/types.ts` with `MemoryScope`, `MemoryType`, record, create/list/search/delete input, and retrieval result types.
- [x] 1.2 Add `src/memory/store.ts` with SQLite schema initialization, path injection, add/list/search/delete operations, and close semantics.
- [x] 1.3 Validate scope/type/text/id inputs with concise errors.
- [x] 1.4 Add tests for valid records, invalid scope/type, scope visibility filtering, list filters, delete missing id, and temp DB isolation.

## 2. Retrieval

- [x] 2.1 Add `src/memory/retrieval.ts` for deterministic keyword tokenization, overlap scoring, recency boost, limit handling, and explainable score metadata.
- [x] 2.2 Ensure retrieval is bounded and stable for equal scores.
- [x] 2.3 Add tests for keyword matches, recency tie-breaks, scope/type filters, visibility filters, empty queries, and limit behavior.

## 3. CLI

- [x] 3.1 Add `kai memory add --scope <scope> --type <type> <text>`.
- [x] 3.2 Add `kai memory list [--scope <scope>] [--type <type>]`.
- [x] 3.3 Add `kai memory search <query> [--scope <scope>] [--type <type>] [--limit <n>]`.
- [x] 3.4 Add `kai memory delete <id>`.
- [x] 3.5 Add CLI smoke tests proving output includes ids/scope/type and does not start a provider request.

## 4. Memory Middleware and ContextItem Integration

- [x] 4.1 Add `src/memory/middleware.ts` to retrieve relevant memories for the current task and produce `ContextItem(kind="memory")`.
- [x] 4.2 Include memory id, scope, type, score, retrieval reason, and store/source metadata on ContextItems.
- [x] 4.3 Register memory middleware in normal run setup without changing provider adapters or tool permissions.
- [x] 4.4 Add context/debug tests proving memory reaches providers only through `ModelInputBuilder`.
- [x] 4.5 Add scope visibility tests covering user-visible memory, project mismatch suppression, session mismatch suppression, and middleware not injecting invisible memory.

## 5. Integration and Exports

- [x] 5.1 Add `src/memory/index.ts` exports and update `src/index.ts` for test-facing helpers.
- [x] 5.2 Keep plan-mode and approval restrictions intact; memory must not grant tools or permissions.
- [x] 5.3 Do not implement automatic extraction, citations, secret guard, stale/archive/merge lifecycle, post-turn sub-agents, or auto skill routing.
- [x] 5.4 Do not change lockfiles or package-manager metadata.

## 6. Validation

- [x] 6.1 Run `openspec validate stage-10b-memory-v0 --strict`.
- [x] 6.2 Run `bun run check`.
- [x] 6.3 Run focused Stage 10B memory tests.
- [x] 6.4 Run related context/run-loop/CLI tests.
- [x] 6.5 Run full `bun run test` before archive.
