## ADDED Requirements

### Requirement: Transcript records recovered failures
The system SHALL persist recovered provider, tool, parse, timeout, and abort failures as bounded transcript facts in session-backed runs.

#### Scenario: Backfilled tool result is recorded
- **WHEN** the run loop backfills a failed tool result for malformed or missing tool output during a session-backed turn
- **THEN** the transcript records the tool call id, tool name, raw failure summary, and exact model-visible `modelContent`

#### Scenario: Provider failure is recorded
- **WHEN** a session-backed turn ends with an unrecovered provider failure
- **THEN** the transcript records a failure status and bounded error metadata suitable for export and replay

#### Scenario: Aborted turn is recorded
- **WHEN** a session-backed turn is aborted
- **THEN** the transcript records aborted status and any recovered interrupted tool results without corrupting prior successful transcript messages

#### Scenario: Rebuilt context skips unrecoverable partials
- **WHEN** provider context is rebuilt from a transcript containing recovered failure facts
- **THEN** it includes only valid assistant/tool message pairs and bounded model-visible failure content

### Requirement: Export and replay explain failures safely
The system SHALL expose recovered failure facts in session export and plain replay without printing hidden thinking, stack traces, API keys, or unbounded command output.

#### Scenario: Failure is exported
- **WHEN** `kai sessions export <session-id>` exports a session with recovered failures
- **THEN** JSONL records include structured failure metadata and bounded model-visible content

#### Scenario: Failure is replayed
- **WHEN** `kai sessions replay <session-id>` prints a session with recovered failures
- **THEN** replay shows concise failure, timeout, interrupted, or backfilled-tool-result summaries

#### Scenario: Secrets appear in failure details
- **WHEN** provider or tool failure details contain secret-like strings
- **THEN** export and replay apply existing masking policies before displaying those details
