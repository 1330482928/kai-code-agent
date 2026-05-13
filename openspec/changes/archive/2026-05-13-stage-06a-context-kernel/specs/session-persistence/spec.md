## ADDED Requirements

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
