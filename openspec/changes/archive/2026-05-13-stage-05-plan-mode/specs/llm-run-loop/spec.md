## ADDED Requirements

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
