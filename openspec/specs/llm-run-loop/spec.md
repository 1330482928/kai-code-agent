# llm-run-loop Specification

## Purpose
TBD - created by archiving change stage-01-minimal-loop. Update Purpose after archive.
## Requirements
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

### Requirement: OpenAI-compatible streaming adapter
The system SHALL implement an OpenAI-compatible provider adapter that sends chat completion requests to `{baseURL}/chat/completions` with `stream: true`, the configured model name, the configured API key, enabled tool schemas when provided, and prior formatted tool result messages when continuing after tool execution; it SHALL expose visible text, hidden thinking, and raw tool-call deltas for the run loop to assemble, and it SHALL statefully normalize streamed content so `<think>...</think>` content never emits as visible text even when tags are split across chunks.

#### Scenario: Streaming response contains text deltas
- **WHEN** the provider returns streaming chat completion chunks with assistant content deltas that contain no thinking markup
- **THEN** the adapter emits internal `text_delta` events preserving the received visible text order

#### Scenario: Response contains split think tags
- **WHEN** streaming content deltas arrive as `<thi`, `nk>secret`, `</thi`, and `nk>visible`
- **THEN** the adapter emits hidden `thinking_delta` content for `secret` and visible `text_delta` content only for `visible`

#### Scenario: Response contains complete think block
- **WHEN** a content delta contains `<think>secret</think>visible`
- **THEN** the adapter emits hidden `thinking_delta` content for `secret` and visible `text_delta` content only for `visible`

#### Scenario: Response contains multiple case-insensitive think blocks
- **WHEN** streamed content contains multiple `<think>` blocks with any tag casing interleaved with visible text
- **THEN** the adapter emits thinking content only as hidden `thinking_delta` and preserves visible text order outside those blocks

#### Scenario: Response ends inside think block
- **WHEN** the provider stream completes while a `<think>` block is still open
- **THEN** the adapter emits the buffered block content only as hidden `thinking_delta` and emits no visible text for the unclosed thinking block

#### Scenario: Response contains native reasoning field
- **WHEN** the provider returns string `reasoning_content`, `reasoning`, or `thinking` fields in complete messages or deltas
- **THEN** the adapter emits those strings as hidden `thinking_delta` events and never as `text_delta`

#### Scenario: Response contains a complete tool call
- **WHEN** the provider returns a complete tool call payload with id, function name, and parseable JSON arguments
- **THEN** the adapter emits a normalized `tool_call` event preserving the tool id, tool name, and parsed input object

#### Scenario: Response contains partial tool arguments
- **WHEN** the provider returns streamed tool argument fragments
- **THEN** the fragments enter the tool argument accumulator and do not become executable tool uses until the accumulated arguments parse as a JSON object

#### Scenario: Tool schemas are provided
- **WHEN** the agent loop starts a provider request with enabled tools
- **THEN** the adapter serializes those tools using the OpenAI-compatible `tools` request field

#### Scenario: Tool results are provided
- **WHEN** the agent loop continues after tool execution
- **THEN** the adapter serializes formatted model-visible tool result messages using OpenAI-compatible role `tool` messages with matching tool call ids

#### Scenario: Streaming response completes
- **WHEN** the provider stream reaches its terminal marker or equivalent completion signal
- **THEN** the adapter flushes pending reasoning splitter state, emits any pending hidden thinking as `thinking_delta`, emits a `done` event, and the loop completes the current provider call

#### Scenario: Provider request fails
- **WHEN** the provider returns a non-success HTTP response or malformed streaming payload
- **THEN** the adapter raises a provider error that the CLI renders as a concise user-facing error summary

### Requirement: Fixture provider supports deterministic replay
The system SHALL provide a fixture provider that replays local scripted provider responses through the same `ProviderEvent` contract used by the OpenAI-compatible provider, including staged responses for tool-call continuation.

#### Scenario: Fixture script is selected
- **WHEN** the user runs `kai run --provider fixture --script fixtures/provider/basic-text.json "hello"`
- **THEN** the loop consumes fixture events without network access and prints the scripted assistant text

#### Scenario: Fixture requests a tool
- **WHEN** a fixture response emits a `tool_call` event for a registered tool
- **THEN** the agent loop executes the tool and consumes the next fixture response as the provider continuation

#### Scenario: Tests use fixture provider
- **WHEN** unit tests or CLI smoke tests exercise Stage 02 behavior
- **THEN** they use fixture replay, temporary workspaces, or injected provider adapters and do not require a real API key or network access

### Requirement: Stage 01 excludes tool and session persistence behavior

The system SHALL NOT send tool definitions, process tool calls, write session transcripts, or persist turn memory to disk during Stage 01 runs.

#### Scenario: One-turn run completes
- **WHEN** a Stage 01 model-backed run completes successfully
- **THEN** only the user-level model config may have been written, and no session transcript or tool result file is created

### Requirement: Generic ReAct loop is tool-pack agnostic
The system SHALL implement the tool-call continuation algorithm independently from the concrete coding tool implementations and SHALL route model/tool execution through middleware, tool argument accumulation, tool result formatting, and current-turn UI event emission.

#### Scenario: Enabled tools are supplied
- **WHEN** the ReAct loop starts with a registry of enabled tools
- **THEN** it sends the provider-facing schemas for those tools without importing individual tool modules directly

#### Scenario: Tool call is dispatched
- **WHEN** the provider emits or assembles a normalized executable tool call
- **THEN** the ReAct loop dispatches the call through middleware, registry, and runner rather than hard-coding a tool name branch

#### Scenario: Raw result is formatted
- **WHEN** the runner or middleware returns a raw tool result
- **THEN** the ReAct loop formats it for model visibility before appending a tool result message

#### Scenario: No tool call is emitted
- **WHEN** the provider emits final assistant text without tool calls
- **THEN** the ReAct loop completes with the same text-only behavior as the Stage 01 run path

#### Scenario: Runtime event is emitted by a tool
- **WHEN** a tool emits a runtime event through `ToolContext.emit`
- **THEN** the ReAct loop converts it to the corresponding current-turn UI event

### Requirement: Provider tool events are normalized
The system SHALL represent complete model-requested tools as provider-neutral executable events containing a tool call id, tool name, and parsed JSON object input, and SHALL keep partial provider arguments inside the accumulator until they are complete.

#### Scenario: Tool call event is emitted
- **WHEN** a provider adapter observes a complete model tool request
- **THEN** it emits a `tool_call` event with the normalized id, name, and input object

#### Scenario: Tool call arguments are malformed
- **WHEN** accumulated final tool call arguments cannot parse as a JSON object
- **THEN** the run loop creates a structured parse-error tool result and does not execute the requested tool

#### Scenario: Tool call arguments are incomplete
- **WHEN** a provider adapter observes incomplete streamed tool arguments
- **THEN** it does not emit an executable `tool_call` event for those partial arguments before the accumulator parses a complete JSON object

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

### Requirement: ReAct loop emits current-turn UI events
The system SHALL emit renderer-agnostic current-turn UI events while processing provider output, tool calls, tool progress, HITL prompts, and turn completion.

#### Scenario: Assistant text streams
- **WHEN** the provider emits visible assistant text
- **THEN** the loop emits `text_delta` UI events in the same order

#### Scenario: Tool starts
- **WHEN** the loop begins executing or intercepting an executable tool use
- **THEN** the loop emits a `tool_start` UI event with a shared tool summary

#### Scenario: Tool finishes
- **WHEN** a tool result is available
- **THEN** the loop emits a `tool_result` UI event with ok/failure status and concise summary

### Requirement: Turn abort is handled
The system SHALL connect Ctrl-C or equivalent abort signals to provider streaming, middleware, HITL prompts, and tool execution.

#### Scenario: User interrupts turn
- **WHEN** the user sends an interrupt during a running turn
- **THEN** the loop aborts provider/tool/HITL work and emits a turn abort boundary event

### Requirement: Visible assistant text excludes hidden thinking
The system SHALL ensure hidden thinking and provider reasoning content never enter assistant visible text, stdout, or default transcript projection paths as ordinary text.

#### Scenario: Run loop receives thinking delta
- **WHEN** the provider emits a `thinking_delta`
- **THEN** the ReAct loop emits a hidden UI event but does not append that text to the assistant visible message content

#### Scenario: Run loop receives normalized visible delta
- **WHEN** the provider emits a `text_delta`
- **THEN** the ReAct loop appends only that visible delta to assistant visible message content and stdout rendering

#### Scenario: Stage 04 transcript projector sees thinking part
- **WHEN** Stage 04 transcript projection receives thinking as a distinct part
- **THEN** default history projection, plain replay, and Ink display exclude it from ordinary visible assistant text

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

### Requirement: ReAct loop runs with an active agent profile
The system SHALL run each model turn with an active agent profile that controls tool schemas, middleware behavior, session recording metadata, and provider context.

#### Scenario: Build profile run starts
- **WHEN** a run starts with active profile `build`
- **THEN** the provider input uses build-profile tool schemas and Stage 04 command behavior remains compatible

#### Scenario: Plan profile run starts
- **WHEN** a run starts with active profile `plan`
- **THEN** the provider input uses plan-profile tool schemas and plan guard middleware is active

#### Scenario: Profile metadata is recorded
- **WHEN** a session-backed run starts with any active profile
- **THEN** the transcript records the profile name with the submitted user message or turn metadata

### Requirement: Run loop handles plan transitions
The system SHALL support model-requested plan transitions while preserving the existing tool-call continuation and formatter pipeline.

#### Scenario: Model requests plan entry
- **WHEN** the provider emits an executable `plan_enter` tool call
- **THEN** the loop records the transition request and continues through normal tool result formatting without executing workspace mutations

#### Scenario: Model requests plan exit
- **WHEN** the provider emits an executable `plan_exit` tool call
- **THEN** the loop runs the plan approval flow and appends the formatted plan tool result back to the provider context

#### Scenario: Plan tool fails
- **WHEN** a plan tool returns a structured failure
- **THEN** the loop appends the formatted failure as a normal tool result message instead of terminating the process

### Requirement: Approved plan context is injected into build runs
The system SHALL add approved plan context to build-profile provider input after a plan is approved.

#### Scenario: Approved plan exists
- **WHEN** a build-profile run starts after plan approval in the same session
- **THEN** the provider receives bounded approved-plan context before the new user task

#### Scenario: No approved plan exists
- **WHEN** a build-profile run starts without an approved plan
- **THEN** the provider input is not modified with plan context

#### Scenario: Resume rebuilds after approval
- **WHEN** a session with an approved plan is resumed
- **THEN** rebuilt provider messages include enough explicit plan context for the build profile to continue from the approved plan

### Requirement: Run loop builds provider input through the context kernel
The system SHALL build every provider request in the ReAct loop through the Context Kernel and ModelInputBuilder instead of manually composing provider messages inside the run loop.

#### Scenario: Text-only provider call is built
- **WHEN** `kai run` starts a text-only task
- **THEN** the run loop produces ContextItems for base, profile, runtime, history if any, and current user input before calling the provider

#### Scenario: Tool continuation provider call is built
- **WHEN** a tool result is appended and the run loop needs another provider call
- **THEN** the continuation request is rebuilt through ModelInputBuilder with prior assistant tool call and tool result messages preserved

#### Scenario: Middleware observes model input
- **WHEN** model middleware runs before a provider call
- **THEN** it receives or can inspect the ModelInputBuilder output without needing to manually reconstruct provider messages

#### Scenario: Existing visible output is preserved
- **WHEN** the builder-backed run completes
- **THEN** stdout, current-turn UI events, session recording, and assistant visible text match the pre-builder behavior for equivalent provider events

### Requirement: Run loop exposes context debug result for tests
The system SHALL make the context build result inspectable through dependency injection or test hooks without printing debug details in normal CLI output.

#### Scenario: Test captures context build result
- **WHEN** a unit test runs the ReAct loop with a fixture provider
- **THEN** it can assert the built ContextItems, included sources, provider messages, and tool schemas

#### Scenario: Normal run hides debug metadata
- **WHEN** a user runs `kai run` normally
- **THEN** context debug metadata is not printed unless a future debug command explicitly requests it

### Requirement: Run loop compacts context before provider overflow
The system SHALL evaluate ContextItems through the context budget planner before each provider request and SHALL compact session-backed history before the provider call when the planned input exceeds the configured compaction threshold.

#### Scenario: Provider request is within budget
- **WHEN** a run-loop provider request is planned within budget
- **THEN** the run loop sends provider input built from the planned ContextItems without invoking compaction

#### Scenario: Provider request exceeds compaction threshold
- **WHEN** a session-backed provider request exceeds the compaction threshold
- **THEN** the run loop generates or reuses a summary, persists it through the session recorder, rebuilds ContextItems with summary plus protected tail, and only then calls the provider

#### Scenario: Compaction fails
- **WHEN** summary generation or summary persistence fails before a provider call
- **THEN** the run loop returns a concise compaction error and leaves the original transcript history intact

#### Scenario: Non-session run exceeds budget
- **WHEN** a non-session-backed run exceeds the configured input budget and cannot persist a summary
- **THEN** the run loop uses deterministic budget trimming where valid or returns a concise context-budget error instead of sending an invalid provider request

### Requirement: Run loop preserves ModelInputBuilder as the provider boundary
The system SHALL continue to send provider requests only from `ModelInputBuilder` output after budget planning and compaction have completed.

#### Scenario: Compaction changes context
- **WHEN** compaction replaces older history with a summary ContextItem
- **THEN** the run loop rebuilds provider input through `ModelInputBuilder` and does not manually splice provider messages

#### Scenario: Tool continuation follows compaction
- **WHEN** the provider requests a tool after a compacted request
- **THEN** subsequent provider continuations use the same context manager and builder path while preserving formatted tool result messages

### Requirement: Compaction remains hidden from ordinary UI output
The system SHALL treat compaction as internal context management and SHALL NOT print summary generation prompts, hidden thinking, or compaction internals as ordinary assistant-visible text.

#### Scenario: Compaction occurs during command-mode run
- **WHEN** a command-mode run compacts history before calling the provider
- **THEN** stdout contains only normal renderer output and assistant visible text from provider `text_delta` events

#### Scenario: Thinking appears during summary generation
- **WHEN** the summary provider emits hidden thinking or reasoning content
- **THEN** the run loop handles it as hidden thinking and does not add it to assistant visible text, prompt debug visible content, or plain replay output

