## ADDED Requirements

### Requirement: Provider calls retry safely
The system SHALL retry retryable provider failures with a bounded policy when no irreversible turn output or tool execution has been committed for the failed provider attempt.

#### Scenario: Retryable provider failure before output
- **WHEN** a provider call fails with a retryable status or transport error before emitting visible text, thinking, usage, or tool-call intent
- **THEN** the run loop retries the provider call according to the configured retry policy

#### Scenario: Retry succeeds
- **WHEN** a retried provider call later completes successfully
- **THEN** the loop continues with the successful provider events and does not record duplicate assistant text or tool calls for failed attempts

#### Scenario: Retry budget is exhausted
- **WHEN** retryable provider failures continue until the retry policy reaches its maximum attempts
- **THEN** the loop fails the turn with a concise provider failure and records the failure status when session-backed

#### Scenario: Failure after partial output is not retried
- **WHEN** a provider call fails after emitting visible text, hidden thinking, usage, or tool-call intent
- **THEN** the loop does not blindly retry that provider request and instead enters recovery or fails the turn with structured diagnostics

### Requirement: Run loop backfills missing tool results
The system SHALL preserve provider tool-call protocol integrity by generating structured failed tool results for malformed, pending, interrupted, or otherwise uncompleted tool calls.

#### Scenario: Malformed final tool arguments
- **WHEN** final streamed tool arguments cannot parse as a JSON object
- **THEN** the loop creates a failed parse-error tool result and does not execute middleware or the target tool

#### Scenario: Pending tool call remains at stream end
- **WHEN** the provider stream ends while a tool call has a name or partial arguments but cannot become an executable tool use
- **THEN** the loop creates a failed tool result for that tool call id before provider continuation or session recording

#### Scenario: Provider failure leaves pending tool intent
- **WHEN** a provider failure occurs after tool-call intent has been observed but before all matching tool results exist
- **THEN** the loop backfills failed tool results for the observed tool calls and records the recovery outcome

#### Scenario: Backfilled result is model-visible
- **WHEN** a missing tool result is backfilled
- **THEN** the content appended to provider messages is produced by `formatToolResultForModel` and contains `ok:false`, `error.kind`, and a concise message

### Requirement: Abort cleanup preserves turn integrity
The system SHALL cleanup provider, middleware, HITL, and tool state when a turn is aborted and SHALL record a resumable aborted turn when session-backed.

#### Scenario: Turn is aborted during provider stream
- **WHEN** the user aborts while provider streaming is active
- **THEN** the loop emits an abort UI boundary, stops consuming provider events, and completes the turn with aborted status

#### Scenario: Turn is aborted during tool execution
- **WHEN** the user aborts while a tool is running
- **THEN** the loop propagates the abort signal to the tool and records an interrupted or aborted result when one can be recovered

#### Scenario: Aborted session can resume
- **WHEN** a session-backed turn is aborted
- **THEN** later `kai resume` can rebuild prior valid transcript context without malformed dangling tool-call/tool-result pairs

### Requirement: Provider failure fixtures are deterministic
The system SHALL support deterministic fixture-provider scripts that can trigger provider failures for retry and recovery tests without network access.

#### Scenario: Fixture emits retryable failure
- **WHEN** a fixture script describes a retryable provider failure before output
- **THEN** tests can assert retry behavior using the same provider adapter interface as normal runs

#### Scenario: Fixture emits unretryable failure
- **WHEN** a fixture script describes an unretryable provider failure
- **THEN** tests can assert user-facing failure formatting and session failure recording without real API calls
