## Context

The current run loop already handles streaming provider events, partial tool-call assembly, tool execution, formatted tool results, session recording, and abort propagation. The weak point is failure boundaries: provider errors currently bubble out of the loop, partial or pending tool calls are not normalized into durable recovery outcomes in every path, and bash timeout/abort/non-zero-exit behavior is not clearly separated enough for future background tasks and MCP tools.

Stage 08 is a cross-cutting hardening stage. It must preserve the existing transcript-first architecture: the SQLite transcript remains authoritative, UiEvents remain live projections, and model-visible tool-result content must be the exact content used for provider continuation.

## Goals / Non-Goals

**Goals:**
- Add a small retry policy for provider calls, with retryability classification, capped exponential backoff, and deterministic tests.
- Keep provider protocol complete by backfilling structured tool results for malformed, pending, or interrupted tool calls before continuation or session persistence.
- Standardize bash failure metadata for timeout, abort, and non-zero exit while keeping output bounded.
- Record recovered failures and aborted turns in session-backed runs so resume/export/replay can explain what happened.
- Emit concise current-turn UI failure summaries without exposing stack traces, hidden thinking, or unbounded command output.

**Non-Goals:**
- No external MCP server recovery semantics; those belong to Stage 09.
- No background task lifecycle, process supervision, or persisted job queue.
- No user-facing retry configuration UI; defaults are code-level policy for this stage.
- No change to the hidden-thinking policy or transcript projection rules except preserving them during failures.

## Decisions

### Decision 1: Retry provider calls at provider-call boundaries

Implement `src/agent/retry.ts` with a `RetryPolicy`, retryability classification, and `runWithRetry` helper used by the ReAct loop around a single provider stream attempt.

Rationale: OpenCode uses explicit retry classification and scheduling; Codex-style provider errors carry status/transport details; Claude Code emphasizes cleanup before fallback. A local helper keeps the Stage 08 implementation small and testable without coupling retry logic to provider-specific adapters.

Alternatives considered:
- Put retries inside `OpenAIProvider`: rejected because fixture provider and future providers need the same loop behavior.
- Retry the entire ReAct run: rejected because it risks duplicating already executed tools and transcript records.

### Decision 2: Retry only before irreversible turn effects

Retry is safe while a provider attempt has not produced committed assistant text, recorded assistant messages, or executed tools. If an attempt has emitted meaningful output or tool intent before failing, the loop should stop, recover/backfill as needed, and surface a structured failure rather than replaying the provider request blindly.

Rationale: Retrying after visible deltas or tool call deltas can duplicate output or cause a model to reissue different tool intent. Stage 08 should prefer protocol integrity over aggressive retry.

Alternatives considered:
- Retry after any retryable status regardless of partial output: rejected because streamed output has side effects in UI/session projections.
- Never retry streaming providers: rejected because transient HTTP 429/500/network failures before output are common and cheaply recoverable.

### Decision 3: Backfill missing tool results as normal `ToolResult`s

Add `src/agent/recovery.ts` to convert malformed final arguments, pending tool calls at stream end, provider failures after tool-call intent, and abort cleanup into failed `ToolResult`s with stable `error.kind`, concise messages, and model-visible content from `formatToolResultForModel`.

Rationale: The provider protocol requires assistant tool calls to be paired with tool results. Treating recovery outcomes as normal failed tool results keeps middleware, session recording, replay, and provider continuation aligned.

Alternatives considered:
- Store recovery only as UI errors: rejected because resume would lose provider protocol facts.
- Throw immediately on malformed tool arguments: rejected because existing Stage 03 behavior already returns parse-error tool results to the model.

### Decision 4: Extend `ToolState` to represent recovery states

Move `ToolState` from `running|done` to `started|running|completed|failed` or equivalent fields that can distinguish normal completion, parse failure, interruption, and backfilled failure. Keep display summaries derived from `summarizeToolUse` and final `ToolResult` summaries.

Rationale: Stage 08 needs to identify unfinished tool calls at cleanup time and present a clear status to UI/session recorders.

Alternatives considered:
- Infer unfinished tools only from local arrays in `react-loop.ts`: rejected because it duplicates state and does not scale to later MCP/background execution.

### Decision 5: Normalize bash failures without making non-zero exit a thrown exception

Keep `bash` as a successful tool invocation for completed commands, including non-zero exit codes, but ensure metadata always includes `exitCode`, `interrupted`, bounded stdout/stderr previews, output byte count, and a normalized status. Timeout and user abort should return failed `ToolResult`s with `timeout` or `interrupted` kind.

Rationale: Shell commands often intentionally return non-zero status for probes. The agent should see exit code metadata and decide next steps, while timeouts/aborts are execution interruptions.

Alternatives considered:
- Treat every non-zero exit as `ok:false`: rejected because it would make common probing commands look like tool infrastructure failures.

### Decision 6: Use fixture-only provider failure scripts

Extend `FixtureProvider` to emit deterministic provider errors in tests. This avoids network dependency and lets Stage 08 verify retry and recovery paths under Bun and Vitest.

Rationale: Stage 01 established real provider support, but deterministic tests must remain fixture-backed.

Alternatives considered:
- Mock `OpenAIProvider.fetch`: rejected because retry/recovery belongs at the loop boundary, not a single provider implementation.

## Risks / Trade-offs

- Retry after partial stream output can duplicate assistant text -> retry only before committed output/tool intent and test that partial-output provider failures do not retry.
- Backfilled tool results can create invalid transcript ordering -> centralize recovery insertion in the same path used by normal tool results and assert rebuilt provider messages preserve ids.
- Bash abort differs between Bun and Node -> define tests around shared `ToolResult` metadata rather than exact process signal mechanics.
- More failure events can add noisy CLI output -> renderer output should be concise and bounded, with detailed diagnostics kept in structured metadata/model content.
- Retry delays can slow tests -> inject sleeper/randomness or allow zero-delay policy in tests.

## Migration Plan

1. Add retry/recovery helpers and tests without changing provider adapters.
2. Wire retry around provider stream attempts in `runReactLoop`.
3. Route parse failures, missing tool results, provider failures, and abort cleanup through recovery helpers.
4. Normalize bash timeout/abort metadata and keep non-zero exit as completed command metadata.
5. Extend fixture provider scripts for retry/error paths.
6. Run Stage 08 tests, related Stage 03/04/07 tests, `bun run check`, and OpenSpec validation.

Rollback is straightforward: revert Stage 08 helper wiring while leaving existing Stage 03/04/07 behavior intact. No data migration is required; new transcript metadata is additive.

## Open Questions

- Should retry policy later move into settings after Stage 12 permission/settings work matures?
- Should provider adapters expose richer retry hints beyond status/body, or is `ProviderError` enough for Stage 08?
- Should future background bash tasks treat non-zero exit differently from foreground `bash`?
