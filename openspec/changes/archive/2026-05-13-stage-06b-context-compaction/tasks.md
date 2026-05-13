## 1. Budget Planner

- [x] 1.1 Add ContextBudget defaults, reserved output budget handling, compact threshold handling, and per-kind cap options under `src/coding/context`.
- [x] 1.2 Implement deterministic token estimation helpers that produce stable estimates for system text, transcript text, tool schemas, and summary content.
- [x] 1.3 Implement budget planning that records included/excluded/truncated status, estimated tokens, priority, sticky handling, and stable cut reasons for every ContextItem.
- [x] 1.4 Extend ModelInputBuilder debug output to include the final budget plan without changing provider adapter input contracts.

## 2. Compaction Core

- [x] 2.1 Implement transcript turn or segment splitting for text messages, assistant tool calls, tool results, summaries, and pending tool state.
- [x] 2.2 Implement tool-pair-aware tail selection so assistant tool calls and matching tool results are retained or summarized as complete units.
- [x] 2.3 Implement compaction prompt construction with the fixed summary schema and bounded source content.
- [x] 2.4 Implement compaction execution through fixture and real provider paths, normalizing summary output and hidden thinking safely.
- [x] 2.5 Implement `ContextManager` orchestration that plans budget, compacts when allowed, rebuilds summary plus tail ContextItems, and returns a final ModelInput build result.

## 3. Session Persistence

- [x] 3.1 Add durable summary recording helpers that store summary content, source range metadata, preserved tail ids, active profile, and timestamps.
- [x] 3.2 Ensure summary recording is idempotent for the same compaction boundary and does not physically delete original transcript messages or parts.
- [x] 3.3 Update transcript-to-ContextItem projection so compacted sessions emit summary ContextItems plus protected recent tail rather than duplicating compacted history.
- [x] 3.4 Update JSONL export and plain replay to expose compaction summary facts safely while preserving hidden-thinking and secret-masking rules.

## 4. Run Loop Integration

- [x] 4.1 Wire ContextManager into `runReactLoop` before each provider request for `kai run`, bare chat submissions, and resume flows.
- [x] 4.2 Ensure provider continuations after tool execution still pass through ContextManager and ModelInputBuilder instead of manually splicing provider messages.
- [x] 4.3 Add concise error handling for failed summary generation, failed summary persistence, and impossible non-session budget plans.
- [x] 4.4 Verify compaction internals do not print to stdout as ordinary assistant text and do not enter visible assistant message content.

## 5. Prompt Debug CLI

- [x] 5.1 Add `kai prompt --debug` command parsing with task input, optional `--session`, optional budget flags, optional `--json`, and optional `--show-items`.
- [x] 5.2 Implement read-only debug snapshots that share the ContextManager planning path but do not send provider requests or append summaries by default.
- [x] 5.3 Render human-readable prompt debug output with budget values, item decisions, cut reasons, provider message summary, tool schema summary, and compaction decision.
- [x] 5.4 Render JSON prompt debug output in a deterministic shape suitable for tests and scripting.
- [x] 5.5 Apply secret masking, bounded content previews, and hidden-thinking exclusion to all prompt debug output modes.

## 6. Tests

- [x] 6.1 Add unit tests for token estimation, budget inclusion/exclusion, sticky items, per-kind caps, and stable cut reasons.
- [x] 6.2 Add unit tests for turn splitting and tool-pair-aware tail selection across complete pairs, split-boundary pairs, and pending tool state.
- [x] 6.3 Add fixture tests for compaction summary generation, summary ContextItem projection, and summary-plus-tail provider input assembly.
- [x] 6.4 Add session persistence tests for summary recording, idempotency, resume projection, JSONL export, and plain replay behavior.
- [x] 6.5 Add CLI smoke tests for `kai prompt --debug`, `--json`, `--show-items`, `--session`, and safe redaction behavior.
- [x] 6.6 Add golden snapshot tests proving identical fixture inputs produce identical item order, cut reasons, compaction decisions, and ModelInput summaries.

## 7. Validation

- [x] 7.1 Run `bun test -- stage-06` and fix failures.
- [x] 7.2 Run related session and run-loop tests, including Stage 03/04 regressions for hidden thinking and transcript projection.
- [x] 7.3 Run `bun run check`.
- [x] 7.4 Run `pnpm exec openspec validate stage-06b-context-compaction`.
- [x] 7.5 Manually smoke `bun run kai prompt --debug --show-items "explain current repo"` and verify no API keys, hidden thinking, or unbounded tool output are printed.
