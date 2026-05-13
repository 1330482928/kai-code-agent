## ADDED Requirements

### Requirement: Transcript records profile and plan metadata
The system SHALL persist active profile, plan path, plan approval status, and approved plan metadata as transcript/session facts.

#### Scenario: Plan profile prompt is recorded
- **WHEN** a user prompt starts a plan-profile run
- **THEN** the user message or turn metadata records the requested and resolved profile

#### Scenario: Plan file is recorded
- **WHEN** a plan file is created or updated
- **THEN** transcript metadata records the plan path and concise summary without storing API keys or unbounded content

#### Scenario: Plan approval is recorded
- **WHEN** a plan approval request is approved or rejected
- **THEN** transcript metadata records the result, plan path, timestamp, and bounded approved plan content or summary

### Requirement: Session rebuild preserves approved plan context
The system SHALL rebuild provider context from stored transcript facts so approved plan handoff survives resume.

#### Scenario: Approved plan session is resumed
- **WHEN** a session containing an approved plan is resumed in build profile
- **THEN** rebuilt provider messages include explicit bounded approved-plan context

#### Scenario: Rejected plan session is resumed
- **WHEN** a session containing only a rejected plan is resumed
- **THEN** rebuilt provider messages do not inject rejected plan content as approved build context

### Requirement: Export and replay show plan facts safely
The system SHALL include plan/profile facts in JSONL export and plain replay while keeping hidden thinking excluded from ordinary visible text.

#### Scenario: Plan metadata is exported
- **WHEN** `kai sessions export <session-id>` exports a session with plan activity
- **THEN** JSONL records include profile and plan metadata needed to audit the transition and approval result

#### Scenario: Plan replay is printed
- **WHEN** `kai sessions replay <session-id>` prints a session with plan activity
- **THEN** replay shows concise plan entered, plan updated, plan approved or plan rejected lines

#### Scenario: Thinking remains hidden in replay
- **WHEN** plan activity occurs in a transcript that also contains thinking parts
- **THEN** replay does not include hidden thinking as plan content
