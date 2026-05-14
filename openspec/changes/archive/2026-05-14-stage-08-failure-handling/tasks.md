## 1. Retry Policy

- [x] 1.1 Add `src/agent/retry.ts` with `RetryPolicy`, default retry constants, retryability classification, and injectable sleep/backoff helpers.
- [x] 1.2 Classify retryable provider failures by `ProviderError.status`, transport/abort markers, and unknown execution errors without retrying user aborts.
- [x] 1.3 Add unit tests for retry classification, exponential backoff capping, max-attempt exhaustion, and zero-delay test policy.

## 2. Provider Failure Fixtures

- [x] 2.1 Extend `FixtureProvider` script schema to emit deterministic provider failure events or staged thrown provider errors.
- [x] 2.2 Add fixture scripts for retry-before-output success, retry exhaustion, unretryable provider failure, and failure after partial output/tool intent.
- [x] 2.3 Add tests proving fixture provider failures use the same `ProviderAdapter` stream path as normal provider events.

## 3. Run Loop Retry Wiring

- [x] 3.1 Wrap each provider stream attempt in the retry helper at the ReAct iteration boundary.
- [x] 3.2 Track whether a provider attempt has emitted irreversible output or tool-call intent before allowing retry.
- [x] 3.3 Preserve middleware `beforeModel`/`afterModel` ordering and context-build semantics across retried attempts.
- [x] 3.4 Add tests for successful retry, exhausted retry, and no-retry-after-partial-output behavior.

## 4. Recovery and Tool Result Backfill

- [x] 4.1 Add `src/agent/recovery.ts` helpers for recovered parse errors, missing tool results, provider-failure tool backfill, and abort cleanup summaries.
- [x] 4.2 Extend `ToolState` to distinguish running, completed, failed, interrupted, and backfilled tool states.
- [x] 4.3 Route malformed final streamed tool arguments through recovery helpers while preserving Stage 03 parse-error behavior.
- [x] 4.4 Backfill failed tool results for pending tool-call intent at stream end or provider failure before continuation.
- [x] 4.5 Ensure backfilled results are formatted by `formatToolResultForModel` before being appended to provider messages.
- [x] 4.6 Add tests for malformed arguments, pending tool calls, provider failure after tool intent, and model-visible backfilled failure JSON.

## 5. Abort Cleanup

- [x] 5.1 Ensure provider stream, middleware, HITL, and tool execution paths receive and honor the run abort signal.
- [x] 5.2 Recover or record interrupted tool results when abort occurs during tool execution.
- [x] 5.3 Emit the existing turn-aborted UI boundary after pending recovery state is flushed.
- [x] 5.4 Add tests proving aborted session-backed turns can be resumed without dangling tool-call/tool-result pairs.

## 6. Bash Failure Normalization

- [x] 6.1 Normalize bash result metadata for success, non-zero exit, timeout, and abort in both Bun and Node runtime paths.
- [x] 6.2 Distinguish timeout from user abort so `error.kind` is `timeout` for timeouts and `interrupted` for run aborts.
- [x] 6.3 Keep non-zero exit as a completed command result with `exitCode`, `interrupted:false`, bounded stdout/stderr previews, and output byte count.
- [x] 6.4 Add tests for non-zero exit, timeout, abort, large-output preview bounding, and formatter output.

## 7. Session Persistence

- [x] 7.1 Record recovered/backfilled tool results with exact `modelContent`, tool call id, tool name, profile, and bounded failure metadata.
- [x] 7.2 Record provider failure and aborted turn status in session-backed runs without corrupting previous transcript messages.
- [x] 7.3 Update transcript rebuild/export/replay paths if needed so recovered failure facts project safely and valid tool pairs are preserved.
- [x] 7.4 Add Bun-backed session tests for recovered tool results, provider failure records, aborted turn records, resume rebuild, export, and replay.

## 8. UI Error Projection

- [x] 8.1 Add or reuse renderer-agnostic UI events for provider failure, recovered tool failure, bash timeout, and abort summaries.
- [x] 8.2 Update plain and Ink renderers to show concise bounded failure summaries without hidden thinking, stack traces, or unbounded output.
- [x] 8.3 Add renderer tests for provider failure, backfilled tool result, bash timeout, abort boundary, and hidden-thinking exclusion near failures.

## 9. CLI and Fixture Smoke

- [x] 9.1 Add CLI fixture smoke coverage for provider retry success and retry exhaustion.
- [x] 9.2 Add CLI fixture smoke coverage for backfilled malformed/pending tool results.
- [x] 9.3 Add CLI fixture smoke coverage for bash timeout/non-zero exit and user abort simulation where deterministic.
- [x] 9.4 Verify command-mode stdout/stderr remains scriptable and does not expose raw stack traces by default.

## 10. Validation

- [x] 10.1 Run `bun test -- stage-08` and fix failures.
- [x] 10.2 Run related Stage 03, Stage 04, Stage 05, Stage 06, and Stage 07 tests for streaming, sessions, context rebuild, and tool regressions.
- [x] 10.3 Run `bun run check`.
- [x] 10.4 Run `pnpm exec openspec validate stage-08-failure-handling`.
- [x] 10.5 Manually run the Stage 08 roadmap demo commands or their implemented fixture equivalents.
