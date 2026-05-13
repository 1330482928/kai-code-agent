## ADDED Requirements

### Requirement: Renderer-agnostic UI events
The system SHALL define renderer-agnostic `UiEvent` types for current-turn text, hidden thinking, tool lifecycle, bash progress, HITL prompts, abort, and turn completion.

#### Scenario: Text delta is emitted
- **WHEN** assistant text is streamed
- **THEN** the current turn emits `text_delta` UI events preserving visible text order

#### Scenario: Thinking delta is emitted
- **WHEN** provider thinking or reasoning content is observed
- **THEN** the current turn emits `thinking_delta` UI events marked hidden

#### Scenario: Tool lifecycle is emitted
- **WHEN** an executable tool use starts and finishes
- **THEN** the current turn emits `tool_start` and `tool_result` events for that tool call id

#### Scenario: Turn finishes
- **WHEN** a turn completes successfully or is aborted
- **THEN** the current turn emits a boundary event so renderers can flush pending state

### Requirement: Tool summaries are shared
The system SHALL provide `summarizeToolUse` to produce renderer-shared titles and details for complete executable tool uses.

#### Scenario: Bash summary is generated
- **WHEN** `summarizeToolUse` receives a `bash` tool use
- **THEN** it returns a title and detail containing the command description or command preview

#### Scenario: File tool summary is generated
- **WHEN** `summarizeToolUse` receives a file tool use
- **THEN** it returns a title and detail containing the relevant path without dumping raw JSON

#### Scenario: Unknown tool summary is generated
- **WHEN** `summarizeToolUse` receives an unknown tool use
- **THEN** it returns a generic title and bounded detail

### Requirement: Plain renderer consumes UI events
The system SHALL update the plain renderer to consume `UiEvent` and render visible text, tool summaries, tool results, bash progress, and prompt notices without printing hidden thinking.

#### Scenario: Hidden thinking is received
- **WHEN** the plain renderer receives `thinking_delta`
- **THEN** it writes nothing to normal stdout by default

#### Scenario: Tool start is received
- **WHEN** the plain renderer receives `tool_start`
- **THEN** it prints a concise tool status line derived from `summarizeToolUse`

#### Scenario: Bash progress is received
- **WHEN** the plain renderer receives `bash_progress`
- **THEN** it prints or updates a concise command progress line without dumping unbounded output

### Requirement: Ink current-turn renderer consumes UI events
The system SHALL provide an Ink current-turn renderer that projects the same `UiEvent` stream as the plain renderer without storing long-term history.

#### Scenario: Current turn is rendered
- **WHEN** a turn is running in an interactive terminal
- **THEN** the Ink renderer displays visible assistant text and current tool status from UI events

#### Scenario: Tool result updates current turn
- **WHEN** a `tool_result` UI event arrives
- **THEN** the Ink renderer updates the current tool status without creating a persistent transcript record

#### Scenario: Renderer resets after turn
- **WHEN** the turn completes
- **THEN** the Ink renderer flushes current-turn state and leaves durable history to Stage 04

### Requirement: Renderer batching controls high-frequency updates
The system SHALL batch high-frequency UI event state commits for Ink rendering while flushing boundary events immediately.

#### Scenario: Text deltas are frequent
- **WHEN** many text delta events arrive in a short window
- **THEN** the batcher groups them into a bounded flush interval

#### Scenario: Boundary event arrives
- **WHEN** an approval request, question request, abort, or turn completion event arrives
- **THEN** the batcher flushes pending events immediately

