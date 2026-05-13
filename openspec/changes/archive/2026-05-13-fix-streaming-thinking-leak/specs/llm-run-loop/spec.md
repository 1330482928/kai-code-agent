## MODIFIED Requirements

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

## ADDED Requirements

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
