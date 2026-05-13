## ADDED Requirements

### Requirement: Compaction summaries are persisted as transcript facts
The system SHALL persist generated compaction summaries as durable transcript facts with stable ids, ordering metadata, source range metadata, and bounded model-visible summary content.

#### Scenario: Summary is recorded
- **WHEN** context compaction generates a summary for a session-backed run
- **THEN** the session store records the summary content, creation timestamp, compacted message ids or range metadata, preserved tail ids, and active profile metadata

#### Scenario: Original messages remain available
- **WHEN** a compaction summary is recorded
- **THEN** the original compacted messages and parts remain present for export, audit, and replay instead of being physically deleted

#### Scenario: Summary recording is idempotent
- **WHEN** the same compaction boundary has already produced a summary
- **THEN** the store can reuse or identify the existing summary rather than appending duplicate summaries for the same source range

### Requirement: Session rebuild projects summaries and protected tail
The system SHALL rebuild provider context from stored summaries plus protected recent tail when a session has compaction summary facts.

#### Scenario: Compacted session is resumed
- **WHEN** `kai resume <session-id> "task"` starts for a session with a compaction summary
- **THEN** context projection emits a `summary` ContextItem for the compacted range and emits retained tail ContextItems for recent text, tool calls, and tool results

#### Scenario: Older compacted text is projected
- **WHEN** a message is covered by an active compaction summary and is not part of the retained tail
- **THEN** default provider-context projection does not also emit that message as ordinary history text

#### Scenario: Tool pair is in retained tail
- **WHEN** a stored assistant tool call and matching tool result are selected for retained tail after compaction
- **THEN** rebuild preserves their matching ids and stored model-visible tool result content

### Requirement: Export and replay expose summaries safely
The system SHALL include compaction summary facts in JSONL export and plain replay while keeping hidden thinking excluded from ordinary visible transcript output.

#### Scenario: Session is exported
- **WHEN** `kai sessions export <session-id>` exports a compacted session
- **THEN** the JSONL output includes summary records and metadata needed to audit which transcript range was compacted

#### Scenario: Session replay is printed
- **WHEN** `kai sessions replay <session-id>` prints a compacted session
- **THEN** the replay shows a concise summary marker or summary content according to replay policy and does not duplicate compacted history as if it were current tail context

#### Scenario: Summary contains sensitive or hidden content
- **WHEN** summary content or metadata includes secret-like strings or hidden thinking source markers
- **THEN** export and replay apply the existing masking and hidden-thinking projection rules
