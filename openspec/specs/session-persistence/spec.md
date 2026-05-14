# session-persistence Specification

## Purpose
TBD - created by archiving change stage-04-session-persistence. Update Purpose after archive.
## Requirements
### Requirement: SQLite transcript store
The system SHALL provide a local Bun SQLite transcript store that persists sessions, messages, and parts as the authoritative conversation record.

#### Scenario: Session is created
- **WHEN** a new session is requested
- **THEN** the store creates a session record with id, created timestamp, updated timestamp, working directory, and optional title metadata

#### Scenario: Message is appended
- **WHEN** a user, assistant, or tool message is appended to a session
- **THEN** the store persists the message with stable id, session id, role, ordering, timestamps, and optional summary

#### Scenario: Part is appended
- **WHEN** text, thinking, tool call, tool result, or summary content is recorded for a message
- **THEN** the store persists a part with message id, ordered index, part type, optional model content, and JSON metadata

#### Scenario: Store initializes repeatedly
- **WHEN** the SQLite store is opened more than once for the same database file
- **THEN** schema initialization is idempotent and existing transcript records remain available

### Requirement: Transcript records model-visible tool context
The system SHALL persist the exact model-visible tool result content used for provider continuation.

#### Scenario: Tool result is recorded
- **WHEN** a tool completes or fails during a session-backed turn
- **THEN** the tool result part stores the exact `modelContent` returned by `formatToolResultForModel`

#### Scenario: Tool result is rebuilt
- **WHEN** provider messages are rebuilt from transcript
- **THEN** the stored `modelContent` is used for the `tool` role message instead of reformatting the historical raw result

#### Scenario: Tool call is recorded
- **WHEN** the model requests an executable tool use
- **THEN** the transcript records the tool call id, tool name, parsed input object, and summary metadata without recording partial argument fragments as executable parts

### Requirement: Bash run metadata is persisted
The system SHALL persist minimal bash run metadata for bash tool results without storing full unbounded command output by default.

#### Scenario: Bash result is recorded
- **WHEN** a `bash` tool result is recorded in a session
- **THEN** the tool result part metadata includes command, cwd, exitCode, interrupted, output preview, output byte count, startedAt, and endedAt

#### Scenario: Bash command succeeds
- **WHEN** a successful bash result is exported or replayed
- **THEN** the exported metadata includes the command, cwd, exitCode, interrupted false, and bounded output preview

#### Scenario: Bash command times out
- **WHEN** an interrupted bash result is exported or replayed
- **THEN** the exported metadata includes interrupted true and exitCode null

### Requirement: Provider messages rebuild from transcript
The system SHALL rebuild provider messages from stored session transcript so a later turn can continue prior context.

#### Scenario: Session is resumed
- **WHEN** `kai resume <session-id> "<task>"` starts
- **THEN** the provider receives rebuilt prior messages followed by a new user message for the submitted task

#### Scenario: Thinking part is rebuilt
- **WHEN** transcript contains hidden thinking parts
- **THEN** rebuilt provider messages do not include hidden thinking as ordinary visible assistant text by default

#### Scenario: Tool messages are rebuilt
- **WHEN** transcript contains assistant tool call and tool result parts
- **THEN** rebuilt provider messages preserve matching tool call ids and model-visible tool result content

### Requirement: Session listing and JSONL export
The system SHALL provide command-accessible session listing and JSONL export for deterministic debugging.

#### Scenario: Sessions are listed
- **WHEN** the user runs `kai sessions`
- **THEN** the CLI prints known sessions with ids, updated timestamps, message counts, and concise titles or summaries

#### Scenario: Session is exported
- **WHEN** the user runs `kai sessions export <session-id>`
- **THEN** the CLI writes JSONL records for session, messages, parts, and bash metadata without including API keys or unbounded raw command output

#### Scenario: Session is replayed
- **WHEN** the user runs `kai sessions replay <session-id>`
- **THEN** the CLI prints a plain transcript projection that hides thinking parts by default and shows concise tool summaries

### Requirement: Transcript records profile and plan metadata
The system SHALL persist active profile, plan path, plan approval status, and approved plan metadata as transcript/session facts.

#### Scenario: Plan profile prompt is recorded
- **WHEN** a user prompt starts a plan-profile run
- **THEN** the user message or turn metadata records the requested and resolved profile

#### Scenario: Plan file is recorded
- **WHEN** a plan file is created or updated
- **THEN** transcript metadata records the plan path and concise summary without storing API keys or unbounded content

#### Scenario: Plan approval is recorded
- **WHEN** a plan approval request is approved or rejected
- **THEN** transcript metadata records the result, plan path, timestamp, and bounded approved plan content or summary

### Requirement: Session rebuild preserves approved plan context
The system SHALL rebuild provider context from stored transcript facts so approved plan handoff survives resume.

#### Scenario: Approved plan session is resumed
- **WHEN** a session containing an approved plan is resumed in build profile
- **THEN** rebuilt provider messages include explicit bounded approved-plan context

#### Scenario: Rejected plan session is resumed
- **WHEN** a session containing only a rejected plan is resumed
- **THEN** rebuilt provider messages do not inject rejected plan content as approved build context

### Requirement: Export and replay show plan facts safely
The system SHALL include plan/profile facts in JSONL export and plain replay while keeping hidden thinking excluded from ordinary visible text.

#### Scenario: Plan metadata is exported
- **WHEN** `kai sessions export <session-id>` exports a session with plan activity
- **THEN** JSONL records include profile and plan metadata needed to audit the transition and approval result

#### Scenario: Plan replay is printed
- **WHEN** `kai sessions replay <session-id>` prints a session with plan activity
- **THEN** replay shows concise plan entered, plan updated, plan approved or plan rejected lines

#### Scenario: Thinking remains hidden in replay
- **WHEN** plan activity occurs in a transcript that also contains thinking parts
- **THEN** replay does not include hidden thinking as plan content

### Requirement: Transcript projects into context items
The system SHALL project stored transcript messages and parts into history, summary, tool result, and plan ContextItems for provider input assembly while preserving the SQLite transcript as the authoritative record.

#### Scenario: Session history is projected
- **WHEN** a session-backed run or resume starts
- **THEN** prior transcript messages are projected into ordered ContextItems before ModelInputBuilder creates provider messages

#### Scenario: Tool history is projected
- **WHEN** transcript history contains assistant tool calls and matching tool result parts
- **THEN** the context projection preserves the matching tool call ids and stored `modelContent` in provider messages

#### Scenario: Thinking history is projected
- **WHEN** transcript history contains hidden thinking parts
- **THEN** the default context projection excludes them from visible assistant content and debug metadata marks the exclusion policy

#### Scenario: Plan facts are projected
- **WHEN** transcript history contains plan entered, updated, approved, or rejected summary parts
- **THEN** context projection can identify active and approved plan facts without treating all plan summaries as ordinary assistant text

### Requirement: Resume uses builder-backed context
The system SHALL support `kai resume` by rebuilding prior context through transcript ContextItems and ModelInputBuilder rather than a separate provider-message-only path.

#### Scenario: Resume starts with prior text
- **WHEN** `kai resume <session-id> "<task>"` starts for a text-only session
- **THEN** the provider input includes prior user and assistant text through builder-backed history projection followed by the new user task

#### Scenario: Resume starts with approved plan
- **WHEN** `kai resume <session-id> "<task>"` starts for a session with an approved plan
- **THEN** the provider input includes the approved plan ContextItem and does not duplicate it through an extra manual system message

#### Scenario: Export and replay remain unchanged
- **WHEN** sessions are exported or replayed after Context Kernel migration
- **THEN** JSONL export and plain replay output remain transcript projections and do not depend on provider-input debug metadata

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
