## ADDED Requirements

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
