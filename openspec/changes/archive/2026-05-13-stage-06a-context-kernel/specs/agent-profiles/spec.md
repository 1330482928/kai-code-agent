## ADDED Requirements

### Requirement: Agent profile prompt is emitted as context
The system SHALL represent build and plan profile prompt identity as profile ContextItems that are assembled by ModelInputBuilder alongside other model-visible context.

#### Scenario: Build profile context is emitted
- **WHEN** a build-profile run starts
- **THEN** the context kernel emits a profile ContextItem identifying build execution behavior and writable expectations

#### Scenario: Plan profile context is emitted
- **WHEN** a plan-profile run starts
- **THEN** the context kernel emits a profile ContextItem identifying planning behavior and non-mutating constraints

#### Scenario: Profile switch updates context
- **WHEN** a session switches from plan profile back to build profile after approval
- **THEN** the next provider input includes build profile context rather than stale plan profile context

### Requirement: Profile tool schemas remain separate from prompt context
The system SHALL keep profile-selected provider tool schemas as provider tools, not serialized prompt text, while including profile metadata in ContextItems.

#### Scenario: Plan profile tools are selected
- **WHEN** the active profile is `plan`
- **THEN** ModelInputBuilder receives plan-safe provider tool schemas and profile ContextItems without duplicating tool schemas in text context

#### Scenario: Build profile tools are selected
- **WHEN** the active profile is `build`
- **THEN** ModelInputBuilder receives build provider tool schemas and build profile ContextItems in the same provider request
