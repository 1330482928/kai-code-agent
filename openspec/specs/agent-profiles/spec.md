# agent-profiles Specification

## Purpose
TBD - created by archiving change stage-05-plan-mode. Update Purpose after archive.
## Requirements
### Requirement: Agent profiles define execution boundaries
The system SHALL provide explicit agent profiles for build and plan execution, including profile name, prompt identity, allowed tools, writable scopes, and metadata passed into the run context.

#### Scenario: Build profile is selected by default
- **WHEN** a run starts without explicit profile metadata or session profile state
- **THEN** the active profile is `build` and existing Stage 04 tool-capable behavior remains available

#### Scenario: Plan profile is selected
- **WHEN** a run starts with prompt metadata requesting `plan`
- **THEN** the active profile is `plan` and the run context records plan profile metadata

#### Scenario: Unknown profile is requested
- **WHEN** prompt metadata requests an unsupported profile name
- **THEN** the run fails with a concise invalid-profile error before sending a provider request

### Requirement: Profiles control provider tool exposure
The system SHALL derive provider-facing tool schemas from the active agent profile instead of always exposing the full build tool set.

#### Scenario: Build profile exposes build tools
- **WHEN** the active profile is `build`
- **THEN** provider tool schemas include normal coding tools and the plan entry tool needed to request plan mode

#### Scenario: Plan profile exposes planning tools only
- **WHEN** the active profile is `plan`
- **THEN** provider tool schemas exclude workspace mutation tools and include only read/question/readonly-bash/plan tools allowed by the plan profile

#### Scenario: Profile changes between turns
- **WHEN** a session switches from `plan` back to `build`
- **THEN** the next provider request uses build profile tool schemas rather than the prior plan profile schemas

### Requirement: Profile state is inspectable and testable
The system SHALL expose profile resolution and profile-specific registry construction through pure or dependency-injected APIs that tests can exercise without a real terminal or provider.

#### Scenario: Profile is resolved in tests
- **WHEN** tests provide prompt metadata and session metadata
- **THEN** they can assert the resolved profile without starting an Ink chat shell

#### Scenario: Profile registry is built in tests
- **WHEN** tests request the provider tool schemas for each profile
- **THEN** they can assert the included and excluded tool names deterministically

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

### Requirement: Profiles expose Stage 07 search and patch tools safely
The system SHALL expose Stage 07 search tools according to profile read/write boundaries and SHALL expose `apply_patch` only to profiles that may mutate workspace files.

#### Scenario: Build profile exposes search and patch tools
- **WHEN** provider schemas are requested for the build profile
- **THEN** the schemas include `grep`, `glob`, and `apply_patch` along with the existing build-profile tools

#### Scenario: Plan profile exposes search tools
- **WHEN** provider schemas are requested for the plan profile
- **THEN** the schemas include `grep` and `glob` because they are read-only planning tools

#### Scenario: Plan profile excludes apply_patch
- **WHEN** provider schemas are requested for the plan profile
- **THEN** the schemas do not include `apply_patch`

#### Scenario: Profile tool names are inspectable
- **WHEN** tests inspect profile tool names for build and plan
- **THEN** they can deterministically assert the Stage 07 tool inclusion and exclusion rules
