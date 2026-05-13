## Context

Stage 06A moved model input assembly behind `ContextItem[] -> ModelInputBuilder`, and archived the contract that provider adapters should remain context agnostic. The current system can expose debug metadata in tests, but it does not yet make budget decisions, compact long transcript history, preserve tool-call/tool-result pairs during context trimming, or provide a scriptable prompt inspection command.

The design must respect the transcript-first rule: SQLite session records remain authoritative and compaction is an additive projection, not a destructive rewrite. It must also preserve Stage 03/04 safety boundaries: hidden thinking stays hidden by default, partial tool arguments never become executable history, and formatted tool results remain the model-visible tool continuation content.

## Goals / Non-Goals

**Goals:**

- Add a `ContextManager` path that plans context budget and optionally compacts before every provider call.
- Persist compaction summaries as durable transcript facts and project them back as `summary` ContextItems.
- Preserve tool-call/tool-result continuity when selecting retained history tail.
- Add `kai prompt --debug` for deterministic, scriptable prompt and budget inspection.
- Keep fixture replay deterministic while allowing real providers to generate summaries in normal runs.

**Non-Goals:**

- No long-term memory, semantic retrieval, skill loading, or sub-agent context injection.
- No new code-editing tool surface, approval policy, or middleware permission model.
- No exact provider tokenizer requirement; a conservative estimator is acceptable in this stage.
- No destructive transcript mutation or automatic removal of old session messages.

## Decisions

### Decision 1: Add `ContextManager` before provider calls

The run loop SHALL build candidate ContextItems, ask `ContextManager` for a budget plan, and only then call `ModelInputBuilder` for the final provider input. If the plan exceeds the compact threshold, `ContextManager` runs compaction, writes a summary record through session persistence, rebuilds ContextItems with the summary plus protected tail, and returns a final build result.

Alternative considered: keep budget logic inside `ModelInputBuilder`. This makes the builder too stateful because compaction needs session writes and provider/fixture summary generation. A separate manager keeps the builder as a pure assembly boundary and keeps provider adapters unaware of ContextItem internals.

Impact: provider API shape stays unchanged, middleware continues to work through run-loop events, and session-backed and non-session-backed runs can share the same planning logic.

### Decision 2: Use conservative deterministic token estimates

Stage 06B SHALL use a deterministic estimator with reserved output budget and per-kind caps. Estimates are not exact provider tokens, but debug output must show the estimate, budget, inclusion status, and cut reason for each item.

Alternative considered: add a tokenizer dependency per provider. This is more accurate but increases dependency and model compatibility work before the agent has stable context behavior. Conservative estimates give enough signal for compaction decisions and golden tests.

Impact: tests can assert exact decisions. Real-provider overflow remains possible with unusual tokenization, so thresholds should leave safety headroom.

### Decision 3: Store compaction as additive transcript summary

Compaction SHALL append a summary transcript fact instead of deleting or rewriting earlier messages. The summary uses a fixed schema:

```md
# Current Goal
# Progress
# Decisions / Constraints
# Critical Files / Commands / Errors
# Remaining Work
```

Original messages remain exportable and auditable. Resume projects summary parts into `summary` ContextItems and projects the retained tail as normal history/tool ContextItems.

Alternative considered: replace old messages with summary rows. That reduces storage size but violates transcript-first auditability and makes JSONL export/replay harder to reason about.

Impact: SQLite schema may need a summary kind/metadata path, but old transcript data requires no migration beyond normal idempotent schema initialization.

### Decision 4: Treat tool continuations as atomic selection units

History selection SHALL split transcript into turns/segments and protect assistant tool-call plus matching tool-result pairs. If a budget boundary would include only half of a pair, the selection either keeps the pair together in the retained tail or summarizes the entire older unit.

Alternative considered: trim flat message arrays by token count. That can produce invalid provider continuations and contradicts Stage 02/04 tool-result formatting contracts.

Impact: compaction needs a small `turns.ts` helper that understands stored assistant tool calls, tool result parts, and pending/incomplete tool state.

### Decision 5: Prompt debug is read-only by default

`kai prompt --debug` SHALL produce the same budget/debug plan used by the run loop, but it does not call the provider or write summaries by default. It can show that compaction would be required and which items would be replaced by summary. Bounded content display is opt-in through `--show-items`; machine-readable output can be added as `--json` without changing the underlying snapshot shape.

Alternative considered: make prompt debug execute actual compaction. That makes a debug command mutate session state and makes repeated inspection nondeterministic. Read-only behavior keeps it safe for local diagnosis and golden tests.

Impact: UI impact is limited to CLI command wiring. Ink/plain renderers do not need to render prompt debug unless a later stage adds an interactive prompt inspector.

### Decision 6: Keep debug output safe by default

Prompt debug and context snapshots SHALL redact known secrets, keep hidden thinking out of visible item content, and bound large content previews. Debug metadata may say that a thinking part was excluded by policy, but default output must not print the thinking text.

Alternative considered: raw full prompt dumps. That is convenient but unsafe with API keys, local files, hidden reasoning, and large tool outputs.

Impact: secret masking and thinking policy remain shared with the current renderer/session projection rules.

## Risks / Trade-offs

- Token estimates differ from provider tokenization -> Use conservative defaults, reserved output budget, and expose estimates in prompt debug.
- Summary loses important context -> Use fixed summary sections, preserve recent tail, retain original transcript, and add tests for critical files/commands/errors.
- Compaction summary provider fails -> Return a concise provider/compaction error for session-backed runs and leave original transcript untouched.
- Tool pair logic misses a transcript shape -> Add tests for complete pairs, pending tool calls, malformed historical tool records, and budget boundaries.
- Prompt debug leaks sensitive content -> Use redaction, bounded previews, hidden-thinking exclusion, and JSON-safe serialization.
- Extra pre-call planning adds latency -> Keep planning local and only call summary provider when threshold is exceeded.

## Migration Plan

1. Add budget, turn-splitting, compaction, and debug snapshot helpers under `src/coding/context`.
2. Extend session persistence with summary write/read helpers while keeping existing schema initialization idempotent.
3. Wire `ContextManager` into `runReactLoop` before each provider request and into resume/session-backed runs.
4. Add `kai prompt --debug` command wiring with read-only defaults.
5. Add fixture scripts and tests for budget decisions, compaction, summary persistence, tool-pair protection, and prompt debug output.
6. Keep rollback simple: remove the manager wiring and the system returns to Stage 06A builder-only behavior while existing summary records remain harmless transcript facts.

## Open Questions

- Should the first implementation expose `--max-input-tokens` and `--reserved-output-tokens` only for tests/debug, or also as supported user-facing flags?
- Should actual compaction be opt-out for real providers when a user prefers a hard overflow error during development?
- Should summary generation use the active model profile or a dedicated lightweight summary profile once model settings support multiple runtime profiles?
