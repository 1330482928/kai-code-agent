## ADDED Requirements

### Requirement: Plan approval requests flow through HumanInteractionManager
The system SHALL support plan approval requests through `HumanInteractionManager` without coupling plan tools or middleware to Ink components.

#### Scenario: Plan approval request is enqueued
- **WHEN** `plan_exit` requests approval for a plan
- **THEN** the manager queues a `plan_approval` request with request id, plan path, bounded plan body, and session/profile metadata

#### Scenario: Plan approval is granted
- **WHEN** a subscriber approves a pending plan approval request
- **THEN** the original `plan_exit` call receives an approved result and the pending request is removed

#### Scenario: Plan approval is denied
- **WHEN** a subscriber rejects or denies a pending plan approval request
- **THEN** the original `plan_exit` call receives a rejected result and the pending request is removed

#### Scenario: Plan approval is aborted
- **WHEN** the turn aborts while plan approval is pending
- **THEN** the manager rejects the pending request and removes it from the queue

### Requirement: Plan approval emits UI events
The system SHALL emit current-turn UI events when a plan approval request becomes pending so plain and Ink renderers can project the request.

#### Scenario: Plan approval UI event is emitted
- **WHEN** a plan approval request is queued
- **THEN** the current turn emits a `plan_approval_request` UI event containing id, plan path, and bounded display text

#### Scenario: Plan approval UI event hides thinking
- **WHEN** the plan body is displayed for approval
- **THEN** hidden thinking parts from the session are not included in the approval display text
