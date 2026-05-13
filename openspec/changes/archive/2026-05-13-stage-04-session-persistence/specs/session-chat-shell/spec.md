## ADDED Requirements

### Requirement: Session-backed chat shell
The system SHALL provide a minimal Ink chat shell backed by transcript sessions.

#### Scenario: Chat starts without session id
- **WHEN** the user runs `kai chat` in an interactive terminal without a session id
- **THEN** the system creates a new session and displays the current session id in the chat shell

#### Scenario: Chat starts with session id
- **WHEN** the user runs `kai chat --session <session-id>`
- **THEN** the system loads that session, projects its history summary, and accepts a new prompt in the same session

#### Scenario: Chat submits a prompt
- **WHEN** the user submits text in the chat shell
- **THEN** the prompt is recorded as a user message and a session-backed agent turn starts

### Requirement: Chat shell projects transcript history
The system SHALL render prior conversation history from transcript projection rather than from live UI event buffers.

#### Scenario: Existing transcript is loaded
- **WHEN** a chat session loads messages and parts from the store
- **THEN** the shell displays concise user, assistant, and tool summaries derived from the transcript projector

#### Scenario: Thinking part exists
- **WHEN** transcript history contains thinking parts
- **THEN** the chat shell does not render those thinking parts as normal visible assistant text by default

#### Scenario: Tool result exists
- **WHEN** transcript history contains tool call and result parts
- **THEN** the chat shell displays a concise tool status summary instead of raw tool input JSON

### Requirement: Chat shell renders current turn from UiEvents
The system SHALL render the currently running turn from the Stage 03 `UiEvent` stream while durable history remains transcript-backed.

#### Scenario: Assistant streams text
- **WHEN** the current turn emits `text_delta` events
- **THEN** the chat shell updates the visible current assistant output in order

#### Scenario: Tool lifecycle streams
- **WHEN** the current turn emits `tool_start`, `bash_progress`, or `tool_result`
- **THEN** the chat shell updates current tool status without writing those live UI events as the authoritative transcript source

#### Scenario: Turn completes
- **WHEN** the current turn emits a completion boundary event
- **THEN** the chat shell flushes current-turn state and refreshes or appends transcript-projected history

### Requirement: Chat shell supports basic session actions
The system SHALL support minimal local chat actions needed to inspect or change the active session.

#### Scenario: Clear current view
- **WHEN** the user invokes the clear local action
- **THEN** the shell clears rendered view state without deleting transcript records

#### Scenario: Resume another session
- **WHEN** the user invokes a resume action with another session id
- **THEN** the shell loads that session and reprojects history from the transcript store

#### Scenario: User aborts current turn
- **WHEN** the user sends Ctrl-C while a turn is running
- **THEN** the current turn is aborted and the shell remains in the same session ready for the next prompt
