## Why

Stage 08 hardens the agent loop so model/provider failures, malformed tool streams, tool interruptions, and bash failures do not leave the conversation protocol or session transcript in an ambiguous state. This matters now because Stage 07 added more mutating/search tools, and later MCP/background-task stages need predictable recovery semantics before more external execution paths are introduced.

## What Changes

### Motivation
- Add a retry/recovery layer around provider streaming so retryable provider/network failures can be retried with bounded backoff instead of immediately terminating a run.
- Ensure every assistant tool call that reaches provider continuation has a matching tool result, including parse-error and aborted/missing tool-result cases.
- Standardize bash timeout, abort, and non-zero exit behavior so CLI, transcript, and model-visible outputs use the same structured result contract.

### Scope
- Add retry classification and bounded exponential backoff for provider calls.
- Add run-loop recovery/backfill behavior for malformed final tool arguments, provider failures after tool calls, and abort cleanup.
- Update bash result normalization so timeout, abort, non-zero exit, stdout/stderr previews, `exitCode`, and `interrupted` metadata are consistently represented.
- Record failure and recovery outcomes into session transcripts without unbounded output.
- Add fixture/test coverage for retry, missing tool result backfill, malformed tool arguments, provider failure, bash timeout/non-zero exit, and abort cleanup.

### Non-goals
- No MCP server failure handling yet; external tool protocols remain a Stage 09 concern.
- No background task runner or persistent process management; bash remains a foreground tool.
- No broad settings UI for retry policy; defaults may be code-level constants for this stage.
- No renderer redesign beyond concise failure/error event projection.

### Risks
- Retrying a provider request after streamed text or tool-call deltas may duplicate visible output or tool intent if not scoped to safe retry windows.
- Backfilled tool results must preserve provider protocol ordering, or resumed sessions may rebuild invalid tool-call/tool-result pairs.
- Bash abort behavior differs between Bun and Node runtimes, so tests must cover the shared contract rather than runtime-specific implementation details.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `llm-run-loop`: provider retry/recovery, missing tool result backfill, parse-failure cleanup, abort cleanup, and provider-continuation protocol integrity.
- `core-tools`: standardized bash failure result contract and model-visible formatting for structured tool failures.
- `session-persistence`: durable transcript recording for recovered failures, aborted turns, and bounded recovered tool results.
- `current-turn-ui`: concise renderer-agnostic failure/abort events and user-readable failure summaries.

## Impact

- Affected agent modules: `src/agent/react-loop.ts`, new retry/recovery helpers under `src/agent/`, `src/agent/tool-state.ts`, and `src/agent/tool-result-formatter.ts`.
- Affected tool modules: `src/coding/tools/bash.ts`, `src/coding/tools/runtime.ts`, and shared tool error normalization helpers.
- Affected session modules: session recorder/store metadata for failure and recovery facts.
- Affected UI modules: plain/Ink renderers consume concise failure/abort events without printing raw stack traces or unbounded command output.
- Affected tests/fixtures: Stage 08 tests and fixture provider scripts for retryable provider errors, malformed tool arguments, pending tool cleanup, bash timeout, and abort paths.
