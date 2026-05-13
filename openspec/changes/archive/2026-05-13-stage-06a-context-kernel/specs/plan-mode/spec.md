## ADDED Requirements

### Requirement: Approved plan handoff uses plan context items
The system SHALL inject approved plan handoff into build-profile provider input as a bounded `plan` ContextItem rather than a manually prepended system message.

#### Scenario: Approved plan is present
- **WHEN** a build-profile run starts from a session containing an approved plan
- **THEN** the context kernel emits a plan ContextItem with the approved plan source, path metadata, and bounded content

#### Scenario: Rejected plan is present
- **WHEN** a session contains a rejected plan but no approved plan
- **THEN** the context kernel does not emit rejected plan content as approved build context

#### Scenario: Plan profile run starts
- **WHEN** the active profile is `plan`
- **THEN** approved build handoff context is not injected as ordinary user or assistant text for the planning request

#### Scenario: Plan content is bounded
- **WHEN** approved plan content exceeds the Stage 05 handoff limit
- **THEN** the plan ContextItem content is bounded with a clear truncation marker before provider input assembly
