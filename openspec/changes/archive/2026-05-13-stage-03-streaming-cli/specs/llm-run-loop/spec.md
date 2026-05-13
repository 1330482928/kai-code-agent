## MODIFIED Requirements

### Requirement: Run command executes one model turn
The system SHALL support `kai run "<task>"` by ensuring model configuration exists, creating the configured provider adapter, running a middleware-backed ReAct loop with enabled tool schemas, processing assistant text and executable tool calls, formatting tool results for provider continuation, emitting current-turn UI events, streaming visible assistant text to stdout, and returning the assistant message for the completed task.

#### Scenario: Configured run succeeds without tool calls
- **WHEN** a valid default model profile exists and the user runs `kai run "hello"`
- **THEN** the system sends one user message with content `hello` to the provider and streams assistant text deltas to stdout

#### Scenario: Provider returns final assistant text
- **WHEN** the provider emits one or more `text_delta` events followed by `done` without requesting tools
- **THEN** the loop returns a turn result containing the original user message and one assistant message with the accumulated text

#### Scenario: Provider requests a tool
- **WHEN** the provider emits a complete tool call for a registered tool before its final assistant answer
- **THEN** the loop executes middleware for the requested tool, executes or intercepts the tool, formats the raw tool result for the model, appends the assistant tool call and formatted tool result messages to context, and calls the provider again with the updated messages

#### Scenario: ReAct loop handles multiple tool continuations
- **WHEN** the provider requests another registered tool after receiving a prior tool result
- **THEN** the loop repeats the middleware, tool execution, formatting, and provider continuation cycle within the same CLI task

#### Scenario: Provider answers after tool result
- **WHEN** the provider emits assistant text after receiving a tool result message
- **THEN** the loop streams that text and returns it as the final assistant message for the task

#### Scenario: Tool execution fails
- **WHEN** a requested tool returns a failed `ToolResult`
- **THEN** the loop sends formatted failure content with `error.kind` back to the provider as a tool result message instead of terminating the CLI process

### Requirement: OpenAI-compatible streaming adapter
The system SHALL implement an OpenAI-compatible provider adapter that sends chat completion requests to `{baseURL}/chat/completions` with `stream: true`, the configured model name, the configured API key, enabled tool schemas when provided, and prior formatted tool result messages when continuing after tool execution; it SHALL expose visible text, hidden thinking, and raw tool-call deltas for the run loop to assemble.

#### Scenario: Streaming response contains text deltas
- **WHEN** the provider returns streaming chat completion chunks with assistant content deltas
- **THEN** the adapter emits internal `text_delta` events preserving the received text order

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
- **THEN** the adapter emits a `done` event and the loop completes the current provider call

#### Scenario: Provider request fails
- **WHEN** the provider returns a non-success HTTP response or malformed streaming payload
- **THEN** the adapter raises a provider error that the CLI renders as a concise user-facing error summary

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

## ADDED Requirements

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

