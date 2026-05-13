## ADDED Requirements

### Requirement: Run command executes one model turn

The system SHALL support `kai run "<task>"` by ensuring model configuration exists, creating the configured provider adapter, sending the task as a user message, streaming assistant text to stdout, and returning the assistant message for the turn.

#### Scenario: Configured run succeeds
- **WHEN** a valid default model profile exists and the user runs `kai run "hello"`
- **THEN** the system sends one user message with content `hello` to the provider and streams assistant text deltas to stdout

#### Scenario: Provider returns final assistant text
- **WHEN** the provider emits one or more `text_delta` events followed by `done`
- **THEN** the loop returns a turn result containing the original user message and one assistant message with the accumulated text

### Requirement: Bare CLI runs minimal interactive turn

The system SHALL support `kai` without a subcommand by ensuring model configuration exists, reading one user task from the terminal, and running the same one-turn model loop.

#### Scenario: Bare CLI receives a task
- **WHEN** the user starts `kai`, completes any required first-run setup, and enters a task
- **THEN** the system runs exactly one model-backed turn for that task and prints the streamed assistant response

### Requirement: OpenAI-compatible streaming adapter

The system SHALL implement an OpenAI-compatible provider adapter that sends chat completion requests to `{baseURL}/chat/completions` with `stream: true`, the configured model name, and the configured API key.

#### Scenario: Streaming response contains text deltas
- **WHEN** the provider returns streaming chat completion chunks with assistant content deltas
- **THEN** the adapter emits internal `text_delta` events preserving the received text order

#### Scenario: Streaming response completes
- **WHEN** the provider stream reaches its terminal marker or equivalent completion signal
- **THEN** the adapter emits a `done` event and the loop completes the turn

#### Scenario: Provider request fails
- **WHEN** the provider returns a non-success HTTP response or malformed streaming payload
- **THEN** the adapter raises a provider error that the CLI renders as a concise user-facing error summary

### Requirement: Fixture provider supports deterministic replay

The system SHALL provide a fixture provider that replays local scripted provider events through the same `ProviderEvent` contract used by the OpenAI-compatible provider.

#### Scenario: Fixture script is selected
- **WHEN** the user runs `kai run --provider fixture --script fixtures/provider/basic-text.json "hello"`
- **THEN** the loop consumes fixture events without network access and prints the scripted assistant text

#### Scenario: Tests use fixture provider
- **WHEN** unit tests or CLI smoke tests exercise Stage 01 behavior
- **THEN** they use fixture replay or injected provider adapters and do not require a real API key or network access

### Requirement: Stage 01 excludes tool and session persistence behavior

The system SHALL NOT send tool definitions, process tool calls, write session transcripts, or persist turn memory to disk during Stage 01 runs.

#### Scenario: One-turn run completes
- **WHEN** a Stage 01 model-backed run completes successfully
- **THEN** only the user-level model config may have been written, and no session transcript or tool result file is created
