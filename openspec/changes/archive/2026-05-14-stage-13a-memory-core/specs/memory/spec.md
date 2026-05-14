## ADDED Requirements

### Requirement: Memory records are typed and statused

The system SHALL store memory records with a stable id, scope, type, status, text, source provenance, and timestamps.

#### Scenario: A memory record is created
- **WHEN** a memory record is added manually or loaded from storage
- **THEN** the record includes scope, type, status, text, source fields, and timestamps

#### Scenario: Invalid memory metadata is rejected
- **WHEN** a memory add request uses an unsupported scope, unsupported type, unsupported status, or empty text
- **THEN** the system returns a concise validation error and does not create a memory record

### Requirement: Memory retrieval is explainable and bounded

The system SHALL retrieve memory records using deterministic scoring with bounded top-k output and a short reason for each match.

#### Scenario: Matching records are ranked
- **WHEN** multiple visible records match a query
- **THEN** the retriever orders them deterministically by score and recency

#### Scenario: Retrieval exposes a reason
- **WHEN** a record is returned by search or context injection
- **THEN** the result includes a concise reason that explains the match

#### Scenario: Retrieval respects a limit
- **WHEN** retrieval is configured with a top-k limit
- **THEN** no more than that number of records is returned

### Requirement: Memory middleware injects only memory ContextItems and records citations

The system SHALL inject memory into model input only as `ContextItem(kind="memory")` and SHALL record a citation for each injected memory record.

#### Scenario: Relevant memory is injected
- **WHEN** the current task matches stored memory
- **THEN** memory middleware contributes one or more `ContextItem(kind="memory")` values

#### Scenario: Citation is recorded for injection
- **WHEN** memory middleware injects a memory record into the current run
- **THEN** the system records a citation entry linked to the session and memory id

#### Scenario: Provider adapters remain memory agnostic
- **WHEN** memory context is included for a provider request
- **THEN** it reaches the provider only through `ModelInputBuilder` output and does not require provider adapter changes

### Requirement: Memory visibility is enforced before retrieval and injection

The system SHALL only expose memory records that are visible in the current run context.

#### Scenario: User memory is visible everywhere
- **WHEN** the user runs list, search, or retrieval from any cwd or session
- **THEN** records with scope `user` may be returned when they otherwise match filters or relevance

#### Scenario: Project memory is hidden in a mismatched project
- **WHEN** the user runs list, search, or retrieval from a cwd or project identity that does not match a stored `project` or `projectLocal` memory
- **THEN** the system does not return that memory record

#### Scenario: Session memory is hidden outside the source session
- **WHEN** the user runs list, search, or retrieval from a session whose id does not match a stored `session` memory's `sourceSessionId`
- **THEN** the system does not return that memory record
