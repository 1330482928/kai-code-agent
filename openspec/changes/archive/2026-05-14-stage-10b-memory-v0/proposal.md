## Why

Stage 10A established skills and slash activation on the existing ContextItem and middleware boundaries. The remaining Stage 10 slice is manual Memory v0: a small, user-controlled memory store that can be inspected, searched, deleted, and injected into model context without introducing automatic extraction or lifecycle policy.

This change gives Kai a conservative memory foundation before the later full memory system. Users can explicitly add durable preferences, decisions, references, project notes, and facts; normal runs can retrieve a bounded set of relevant records; and the model receives them only as `ContextItem(kind="memory")` through `ModelInputBuilder`.

## What Changes

### Motivation

- Provide a manual way to persist reusable user/project facts without treating transcript history as long-term memory.
- Keep Memory v0 debuggable: users can list, search, and delete records from the CLI before any automatic write path exists.
- Reuse the existing middleware and ContextItem pipeline so memory does not hand-write provider messages or bypass context budgets.
- Keep the first memory slice small enough to validate independently before Stage 13 adds citations, extraction, lifecycle, and safety policy.

### Scope

- Add Memory v0 record types with basic `scope`, `type`, text, id, created/updated timestamps, and optional manual source metadata.
- Add a local SQLite-backed memory store with deterministic CRUD operations and test-friendly path injection.
- Add `kai memory add`, `kai memory list`, `kai memory search`, and `kai memory delete`.
- Add simple keyword and recency scoring for manual memory search and run-time retrieval.
- Add memory middleware that retrieves top relevant records for the current task and contributes `ContextItem(kind="memory")` values before model input assembly.
- Register memory middleware in normal run setup without changing provider adapters.
- Add focused tests and CLI smoke coverage for store CRUD, search ranking, CLI behavior, and context injection.
- Bind memory visibility to scope keys so `user` memory is global, `project` and `projectLocal` memory are visible only when the current `cwd` or project identity matches, and `session` memory is visible only when `sourceSessionId` matches the current session.

### Non-goals

- No automatic memory extraction from turns.
- No memory citations, usage attribution, or audit trail.
- No secret guard, sensitive data classifier, or policy gate.
- No stale/archive/merge/refresh lifecycle.
- No post-turn extraction sub-agent.
- No auto skill routing or interaction with skill activation.
- No permission engine expansion.
- No package manager or lockfile changes.

### Risks

- Manual memories can still contain sensitive text if users add it explicitly; this slice keeps the behavior explicit and defers secret guard to a later approved stage.
- Keyword retrieval can miss semantic matches; this is acceptable for v0 and keeps search explainable.
- Project and user scopes can confuse users if storage is opaque; CLI output must show scope/type/source metadata.
- Memory context can become noisy; retrieval must be limited, ordered, and budget-aware.
- Scope filtering must be enforced consistently across storage, list/search/retrieval, and middleware injection so records never leak across projects or sessions.
- Adding another CLI namespace can regress existing commands; tests should cover unknown and invalid memory subcommands.

## Capabilities

### New Capabilities

- `memory`: Covers manual Memory v0 records, CLI CRUD/search, simple retrieval, and memory ContextItem injection.

### Modified Capabilities

- `llm-run-loop`: Registers memory middleware for normal runs so memory ContextItems are available before provider input assembly.
- `context-kernel`: Uses the existing reserved `memory` ContextItem kind; no provider adapter shape changes.

## Impact

- Planned implementation modules are limited to `src/memory/`, CLI command handling, run setup middleware registration, exports, and tests.
- Planned specs are limited to a new `memory` capability; existing specs should only be touched if implementation needs a narrow CLI/run-loop acceptance update.
- Planned tests include store CRUD, CLI add/list/search/delete, retrieval ordering, middleware ContextItems, budget/debug behavior, and regression checks that provider adapters only see `ModelInputBuilder` output.
