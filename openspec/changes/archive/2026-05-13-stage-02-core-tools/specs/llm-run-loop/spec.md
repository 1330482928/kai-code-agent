## MODIFIED Requirements

### Requirement: Run command executes one model turn
The system SHALL support `kai run "<task>"` by ensuring model configuration exists, creating the configured provider adapter, running a generic ReAct loop with enabled tool schemas, processing assistant text and executable tool calls, formatting tool results for provider continuation, streaming assistant text to stdout, and returning the assistant message for the completed task.

#### Scenario: Configured run succeeds without tool calls
- **WHEN** a valid default model profile exists and the user runs `kai run "hello"`
- **THEN** the system sends one user message with content `hello` to the provider and streams assistant text deltas to stdout

#### Scenario: Provider returns final assistant text
- **WHEN** the provider emits one or more `text_delta` events followed by `done` without requesting tools
- **THEN** the loop returns a turn result containing the original user message and one assistant message with the accumulated text

#### Scenario: Provider requests a tool
- **WHEN** the provider emits a complete tool call for a registered tool before its final assistant answer
- **THEN** the loop executes the requested tool, formats the raw tool result for the model, appends the assistant tool call and formatted tool result messages to context, and calls the provider again with the updated messages

#### Scenario: ReAct loop handles multiple tool continuations
- **WHEN** the provider requests another registered tool after receiving a prior tool result
- **THEN** the loop repeats the tool execution and provider continuation cycle within the same CLI task

#### Scenario: Provider answers after tool result
- **WHEN** the provider emits assistant text after receiving a tool result message
- **THEN** the loop streams that text and returns it as the final assistant message for the task

#### Scenario: Tool execution fails
- **WHEN** a requested tool returns a failed `ToolResult`
- **THEN** the loop sends formatted failure content with `error.kind` back to the provider as a tool result message instead of terminating the CLI process

### Requirement: OpenAI-compatible streaming adapter
The system SHALL implement an OpenAI-compatible provider adapter that sends chat completion requests to `{baseURL}/chat/completions` with `stream: true`, the configured model name, the configured API key, enabled tool schemas when provided, and prior formatted tool result messages when continuing after tool execution.

#### Scenario: Streaming response contains text deltas
- **WHEN** the provider returns streaming chat completion chunks with assistant content deltas
- **THEN** the adapter emits internal `text_delta` events preserving the received text order

#### Scenario: Response contains a complete tool call
- **WHEN** the provider returns a complete tool call payload with id, function name, and parseable JSON arguments
- **THEN** the adapter emits a normalized `tool_call` event preserving the tool id, tool name, and parsed input object

#### Scenario: Response contains partial tool arguments
- **WHEN** the provider returns only partial streamed tool argument fragments
- **THEN** Stage 02 does not dispatch the tool use through the runner and leaves streamed argument accumulation to Stage 03

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

## ADDED Requirements

### Requirement: Generic ReAct loop is tool-pack agnostic
The system SHALL implement the tool-call continuation algorithm independently from the concrete coding tool implementations.

#### Scenario: Enabled tools are supplied
- **WHEN** the ReAct loop starts with a registry of enabled tools
- **THEN** it sends the provider-facing schemas for those tools without importing individual tool modules directly

#### Scenario: Tool call is dispatched
- **WHEN** the provider emits a normalized tool call
- **THEN** the ReAct loop dispatches the call through the registry and runner rather than hard-coding a tool name branch

#### Scenario: Raw result is formatted
- **WHEN** the runner returns a raw tool result
- **THEN** the ReAct loop formats it for model visibility before appending a tool result message

#### Scenario: No tool call is emitted
- **WHEN** the provider emits final assistant text without tool calls
- **THEN** the ReAct loop completes with the same text-only behavior as the Stage 01 run path

### Requirement: Provider tool events are normalized
The system SHALL represent complete model-requested tools as provider-neutral executable events containing a tool call id, tool name, and parsed JSON object input.

#### Scenario: Tool call event is emitted
- **WHEN** a provider adapter observes a complete model tool request
- **THEN** it emits a `tool_call` event with the normalized id, name, and input object

#### Scenario: Tool call arguments are malformed
- **WHEN** a provider adapter cannot parse the completed tool call arguments as JSON
- **THEN** it raises a provider error with a concise malformed-arguments message

#### Scenario: Tool call arguments are incomplete
- **WHEN** a provider adapter observes incomplete streamed tool arguments
- **THEN** it does not emit an executable `tool_call` event for those partial arguments in Stage 02

### Requirement: Tool-capable runs remain command compatible
The system SHALL keep command-mode output scriptable while adding tool execution.

#### Scenario: Fixture run executes tools
- **WHEN** the user runs `kai run --provider fixture --script <tool-fixture> "<task>"`
- **THEN** the command completes through normal stdout/stderr without requiring an interactive Ink screen

#### Scenario: Bare kai submits a task
- **WHEN** the user submits a task through the existing bare `kai` Ink task entry
- **THEN** the submitted task can use the same tool-capable loop as `kai run`
