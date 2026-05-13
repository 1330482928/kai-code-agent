## ADDED Requirements

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
