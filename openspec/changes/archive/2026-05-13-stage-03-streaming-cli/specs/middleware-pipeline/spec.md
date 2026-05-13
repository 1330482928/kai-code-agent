## ADDED Requirements

### Requirement: Ordered middleware pipeline
The system SHALL provide an ordered middleware pipeline with run, model, and tool lifecycle hooks.

#### Scenario: Middleware hooks run in registration order
- **WHEN** multiple middleware instances are registered for the same hook
- **THEN** the pipeline invokes them in registration order

#### Scenario: Agent run starts
- **WHEN** an agent run begins
- **THEN** the pipeline invokes `beforeAgentRun` hooks before the first provider request

#### Scenario: Agent run completes
- **WHEN** an agent run completes or fails
- **THEN** the pipeline invokes `afterAgentRun` hooks with the final status

### Requirement: Model middleware wraps provider calls
The system SHALL allow middleware to observe and optionally adjust model input before provider calls and observe model completion after provider calls.

#### Scenario: Before model hook returns replacement input
- **WHEN** a `beforeModel` hook returns model input
- **THEN** the provider request uses that returned input for the current call

#### Scenario: After model hook observes completion
- **WHEN** a provider call completes
- **THEN** `afterModel` hooks receive the model context and completion metadata

### Requirement: Tool middleware may intercept execution
The system SHALL allow `beforeToolUse` middleware to return a `ToolResult` that skips real tool execution.

#### Scenario: Tool is approved
- **WHEN** no `beforeToolUse` hook returns a `ToolResult`
- **THEN** the ReAct loop executes the requested tool through the normal runner

#### Scenario: Tool is intercepted
- **WHEN** a `beforeToolUse` hook returns a `ToolResult`
- **THEN** the ReAct loop does not invoke the real tool runner and uses the returned result for model continuation

#### Scenario: After tool hook observes raw result
- **WHEN** a tool is executed or intercepted
- **THEN** `afterToolUse` hooks receive the executable tool use and raw `ToolResult`

### Requirement: Middleware is abort-aware
The system SHALL pass an abort signal through middleware contexts and stop pending middleware work when the current turn is aborted.

#### Scenario: Turn is aborted during middleware
- **WHEN** the abort signal is triggered while middleware is pending
- **THEN** the middleware pipeline stops waiting and the turn ends with an abort result

