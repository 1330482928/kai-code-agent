## MODIFIED Requirements

### Requirement: Renderer-agnostic UI events
The system SHALL define renderer-agnostic `UiEvent` types for current-turn text, hidden thinking, tool lifecycle, bash progress, HITL prompts, abort, and turn completion; hidden thinking SHALL be represented only by `thinking_delta` events marked hidden, not by raw `<think>` markup in `text_delta`.

#### Scenario: Text delta is emitted
- **WHEN** assistant visible text is streamed
- **THEN** the current turn emits `text_delta` UI events preserving visible text order and excluding hidden thinking

#### Scenario: Thinking delta is emitted
- **WHEN** provider thinking or reasoning content is observed
- **THEN** the current turn emits `thinking_delta` UI events marked hidden

#### Scenario: Tool lifecycle is emitted
- **WHEN** an executable tool use starts and finishes
- **THEN** the current turn emits `tool_start` and `tool_result` events for that tool call id

#### Scenario: Turn finishes
- **WHEN** a turn completes successfully or is aborted
- **THEN** the current turn emits a boundary event so renderers can flush pending state

### Requirement: Plain renderer consumes UI events
The system SHALL update the plain renderer to consume `UiEvent` and render visible text, tool summaries, tool results, bash progress, and prompt notices without printing hidden thinking; the plain renderer SHALL rely on typed `thinking_delta` semantics and not act as the primary parser for raw provider `<think>` markup.

#### Scenario: Hidden thinking is received
- **WHEN** the plain renderer receives `thinking_delta`
- **THEN** it writes nothing to normal stdout by default

#### Scenario: Visible text is received after hidden thinking
- **WHEN** the plain renderer receives hidden `thinking_delta` followed by visible `text_delta`
- **THEN** stdout contains only the visible text

#### Scenario: Tool start is received
- **WHEN** the plain renderer receives `tool_start`
- **THEN** it prints a concise tool status line derived from `summarizeToolUse`

#### Scenario: Bash progress is received
- **WHEN** the plain renderer receives `bash_progress`
- **THEN** it prints or updates a concise command progress line without dumping unbounded output

### Requirement: Ink current-turn renderer consumes UI events
The system SHALL provide an Ink current-turn renderer that projects the same `UiEvent` stream as the plain renderer without storing long-term history and without displaying hidden thinking by default.

#### Scenario: Current turn is rendered
- **WHEN** a turn is running in an interactive terminal
- **THEN** the Ink renderer displays visible assistant text and current tool status from UI events

#### Scenario: Thinking delta is received
- **WHEN** the Ink current-turn renderer receives `thinking_delta`
- **THEN** it does not append that thinking content to the visible current-turn text by default

#### Scenario: Tool result updates current turn
- **WHEN** a `tool_result` UI event arrives
- **THEN** the Ink renderer updates the current tool status without creating a persistent transcript record

#### Scenario: Renderer resets after turn
- **WHEN** the turn completes
- **THEN** the Ink renderer flushes current-turn state and leaves durable history to Stage 04
