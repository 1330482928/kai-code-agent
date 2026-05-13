## MODIFIED Requirements

### Requirement: Run command executes one model turn
The system SHALL support `kai run "<task>"` by ensuring model configuration exists, creating the configured provider adapter, optionally attaching a transcript session when requested, running a middleware-backed ReAct loop with enabled tool schemas, processing assistant text and executable tool calls, formatting tool results for provider continuation, emitting current-turn UI events, streaming visible assistant text to stdout, recording transcript parts for session-backed runs, and returning the assistant message for the completed task.

#### Scenario: Configured run succeeds without tool calls
- **WHEN** a valid default model profile exists and the user runs `kai run "hello"`
- **THEN** the system sends one user message with content `hello` to the provider and streams assistant text deltas to stdout

#### Scenario: Provider returns final assistant text
- **WHEN** the provider emits one or more `text_delta` events followed by `done` without requesting tools
- **THEN** the loop returns a turn result containing the original user message and one assistant message with the accumulated text

#### Scenario: Provider requests a tool
- **WHEN** the provider emits a complete tool call for a registered tool before its final assistant answer
- **THEN** the loop executes middleware for the requested tool, executes or intercepts the tool, formats the raw tool result for the model, appends the assistant tool call and formatted tool result messages to context, records session transcript parts when session-backed, and calls the provider again with the updated messages

#### Scenario: ReAct loop handles multiple tool continuations
- **WHEN** the provider requests another registered tool after receiving a prior tool result
- **THEN** the loop repeats the middleware, tool execution, formatting, transcript recording when enabled, and provider continuation cycle within the same CLI task

#### Scenario: Provider answers after tool result
- **WHEN** the provider emits assistant text after receiving a tool result message
- **THEN** the loop streams that text and returns it as the final assistant message for the task

#### Scenario: Tool execution fails
- **WHEN** a requested tool returns a failed `ToolResult`
- **THEN** the loop sends formatted failure content with `error.kind` back to the provider as a tool result message instead of terminating the CLI process

### Requirement: Bare CLI runs minimal interactive turn

The system SHALL support `kai` without a subcommand by ensuring model configuration exists and, in an interactive terminal, starting the session-backed chat shell; in non-interactive fallback mode it SHALL preserve the existing prompt-and-run behavior.

#### Scenario: Bare CLI starts interactive chat
- **WHEN** the user starts `kai` with valid model config in an interactive terminal
- **THEN** the system starts a session-backed chat shell instead of a one-turn-only task entry view

#### Scenario: Bare CLI fallback receives a task
- **WHEN** the user starts `kai` in non-interactive fallback mode, completes any required first-run setup, and enters a task
- **THEN** the system runs one model-backed turn for that task and prints the streamed assistant response

### Requirement: Tool-capable runs remain command compatible
The system SHALL keep command-mode output scriptable while adding tool execution and optional session persistence.

#### Scenario: Fixture run executes tools
- **WHEN** the user runs `kai run --provider fixture --script <tool-fixture> "<task>"`
- **THEN** the command completes through normal stdout/stderr without requiring an interactive Ink screen

#### Scenario: Session-backed fixture run executes tools
- **WHEN** the user runs `kai run --provider fixture --session new --script <tool-fixture> "<task>"`
- **THEN** the command completes through normal stdout/stderr and records transcript facts for the created session

#### Scenario: Bare kai submits a task
- **WHEN** the user submits a prompt through the bare `kai` chat shell
- **THEN** the submitted prompt uses the same tool-capable loop as `kai run` with an attached session

## ADDED Requirements

### Requirement: Resume command continues stored context
The system SHALL support `kai resume <session-id> "<task>"` by rebuilding provider context from transcript and appending a new turn to the same session.

#### Scenario: Resume command starts
- **WHEN** the user runs `kai resume <session-id> "what did I say?"`
- **THEN** the system loads the session transcript, rebuilds prior provider messages, appends the new user task, and runs the provider continuation in that session

#### Scenario: Missing session is requested
- **WHEN** the user runs `kai resume <missing-session-id> "<task>"`
- **THEN** the command fails with a concise session-not-found error and does not start a provider request

#### Scenario: Resume records new turn
- **WHEN** a resume command completes successfully
- **THEN** the new user message, assistant response, and any tool parts are persisted in the same session

### Requirement: Session recorder observes run-loop milestones
The system SHALL let the ReAct loop emit durable recording events to an optional session recorder without importing SQLite into the agent core.

#### Scenario: Recorder is absent
- **WHEN** the ReAct loop runs without a session recorder
- **THEN** behavior remains equivalent to Stage 03 command-mode execution

#### Scenario: Recorder is attached
- **WHEN** the ReAct loop runs with a session recorder
- **THEN** user messages, assistant text and thinking parts, executable tool calls, tool results, and turn boundaries are offered to the recorder in execution order

#### Scenario: Recorder fails
- **WHEN** the recorder fails to persist a required transcript record
- **THEN** the run returns a concise persistence error instead of silently continuing with a corrupt session transcript
