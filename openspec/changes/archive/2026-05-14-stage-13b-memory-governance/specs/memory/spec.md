## ADDED Requirements

### Requirement: Memory extraction produces reviewable candidates

The system SHALL produce memory candidates after a turn completes, rather than writing extraction results directly to the long-term store.

#### Scenario: Extraction yields candidates
- **WHEN** a turn finishes and extraction is enabled
- **THEN** the system produces reviewable memory candidates with text, type, suggested scope, reason, confidence, and source provenance

#### Scenario: Extraction is dry-run by default
- **WHEN** extraction is configured without write approval
- **THEN** the system records candidates without persisting them as memory records

### Requirement: Secret guard prevents unsafe memory writes

The system SHALL reject or downgrade candidates that contain secrets or sensitive data before long-term persistence.

#### Scenario: A sensitive candidate is blocked
- **WHEN** a candidate contains an API key, token, private key, cookie, or `.env` value
- **THEN** the system does not write the candidate to long-term memory

#### Scenario: Guarded candidates remain auditable
- **WHEN** a candidate is blocked by the secret guard
- **THEN** the system records a concise reason for the rejection

### Requirement: Memory lifecycle actions are explicit and auditable

The system SHALL support explicit lifecycle operations for memory records.

#### Scenario: A record is archived
- **WHEN** the user archives a memory record
- **THEN** the record status changes to archived and the action is auditable

#### Scenario: A record is refreshed
- **WHEN** the user refreshes a memory record
- **THEN** the record status or timestamps are updated without duplicating unrelated content

#### Scenario: Records can be merged or deleted
- **WHEN** the user requests merge or delete on one or more memory records
- **THEN** the system applies the requested lifecycle action and preserves auditability

### Requirement: Memory policy gates govern writes and lifecycle actions

The system SHALL use policy controls to decide when memory extraction can write and when lifecycle actions require confirmation.

#### Scenario: Policy blocks unsafe writes
- **WHEN** a candidate write violates policy or scope rules
- **THEN** the system does not persist the candidate

#### Scenario: CLI exposes governance operations
- **WHEN** the user runs memory governance commands
- **THEN** the CLI can list, inspect, promote, archive, refresh, merge, delete, and explain memory records according to policy
