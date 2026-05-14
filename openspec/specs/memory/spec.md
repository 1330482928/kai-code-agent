# memory Specification

## Purpose
TBD - created by archiving change stage-10b-memory-v0. Update Purpose after archive.
## Requirements
### Requirement: Manual Memory v0 records are stored with scope and type

The system SHALL store manually created memory records with stable ids, basic scope/type metadata, bounded text, and timestamps.

#### Scenario: User memory is added
- **WHEN** the user adds memory text with scope `user` and type `preference`
- **THEN** the system persists a record with an id, scope `user`, type `preference`, text, `createdAt`, and `updatedAt`

#### Scenario: Project memory is added
- **WHEN** the user adds memory text with scope `project` or `projectLocal`
- **THEN** the stored record preserves that scope and enough project metadata for list/search output to distinguish it from user memory and filter it by the active project identity

#### Scenario: Invalid metadata is rejected
- **WHEN** a memory add request uses an unsupported scope, unsupported type, or empty text
- **THEN** the system returns a concise validation error and does not create a memory record

### Requirement: Memory scope visibility is enforced before retrieval and injection

The system SHALL only expose memory records that are visible in the current run context. User memory is globally visible. Project and projectLocal memory are only visible when the current project identity, cwd, or projectPath matches the record's stored project binding. Session memory is only visible when `sourceSessionId` matches the active session.

#### Scenario: User memory is visible everywhere
- **WHEN** the user runs list, search, or retrieval from any cwd or session
- **THEN** records with scope `user` may be returned when they otherwise match filters or relevance

#### Scenario: Project memory is hidden in a mismatched project
- **WHEN** the user runs list, search, or retrieval from a cwd or project identity that does not match a stored `project` or `projectLocal` memory
- **THEN** the system does not return that memory record

#### Scenario: Session memory is hidden outside the source session
- **WHEN** the user runs list, search, or retrieval from a session whose id does not match a stored `session` memory's `sourceSessionId`
- **THEN** the system does not return that memory record

#### Scenario: Middleware only injects visible memory
- **WHEN** memory middleware builds ContextItems for the current run
- **THEN** only records visible in the current run context are injected as `ContextItem(kind="memory")`

### Requirement: Memory CLI supports manual add, list, search, and delete

The system SHALL provide scriptable `kai memory` commands for manually managing Memory v0 records without starting a provider request.

#### Scenario: Memory add command prints an id
- **WHEN** the user runs `kai memory add --scope user --type preference "Prefer concise answers"`
- **THEN** stdout includes the created memory id, scope, type, and bounded text

#### Scenario: Memory list command shows stored records
- **WHEN** the user runs `kai memory list`
- **THEN** stdout lists matching memory ids, scopes, types, timestamps, and bounded text

#### Scenario: Memory list command filters by scope and type
- **WHEN** the user runs `kai memory list --scope user --type preference`
- **THEN** stdout includes only records matching both filters

#### Scenario: Memory search command returns relevant records
- **WHEN** the user runs `kai memory search concise`
- **THEN** stdout lists matching records ordered by Memory v0 relevance score and includes concise score or reason metadata

#### Scenario: Memory delete command removes a record
- **WHEN** the user runs `kai memory delete <id>` for an existing memory
- **THEN** the record is removed from subsequent list and search results

#### Scenario: Unknown memory subcommand is rejected
- **WHEN** the user runs an unsupported `kai memory` subcommand
- **THEN** the CLI reports concise usage and does not start a model run

### Requirement: Memory retrieval uses deterministic keyword and recency scoring

The system SHALL retrieve Memory v0 records using a deterministic, bounded score based on keyword overlap with the current task plus recency ordering.

#### Scenario: Keyword overlap ranks higher
- **WHEN** two memory records are eligible and one shares more query terms with the task
- **THEN** the higher-overlap record is ranked before the lower-overlap record

#### Scenario: Recency breaks close ties
- **WHEN** eligible memory records have equal keyword relevance
- **THEN** the more recently updated record is ranked first

#### Scenario: Retrieval limit is enforced
- **WHEN** retrieval is configured with a limit
- **THEN** no more than that number of records is returned for context injection or CLI search

#### Scenario: Empty retrieval is allowed
- **WHEN** no memory records match the task or filters
- **THEN** retrieval returns an empty result without failing the run

### Requirement: Memory middleware injects memory through ContextItems

The system SHALL inject relevant Memory v0 records into model input only as `ContextItem(kind="memory")` before `ModelInputBuilder` assembles provider input.

#### Scenario: Relevant memory is injected
- **WHEN** a model run starts with a task that matches stored memory
- **THEN** memory middleware contributes one or more `ContextItem(kind="memory")` values containing bounded memory text

#### Scenario: Memory context carries metadata
- **WHEN** memory middleware contributes a ContextItem
- **THEN** the item metadata includes memory id, scope, type, retrieval score, and a concise retrieval reason

#### Scenario: Provider adapters remain memory agnostic
- **WHEN** memory context is included for a provider request
- **THEN** it reaches the provider only through `ModelInputBuilder` output and does not require provider adapter changes

#### Scenario: Memory does not grant permissions
- **WHEN** a memory record mentions a tool, command, or workflow preference
- **THEN** memory middleware treats it as model-visible context only and does not grant tools or alter approval behavior

### Requirement: Memory v0 excludes automatic extraction and lifecycle features

The system SHALL keep Memory v0 limited to manual records, simple retrieval, and explicit deletion.

#### Scenario: Turn completion does not write memory
- **WHEN** an agent turn completes
- **THEN** the system does not automatically extract or persist new memory from the transcript

#### Scenario: Citation tracking is absent in v0
- **WHEN** memory is injected into context
- **THEN** the system does not record memory usage citations or audit attribution in this change

#### Scenario: Lifecycle commands are not implemented in v0
- **WHEN** the user asks the memory CLI to stale, archive, merge, refresh, or promote memory
- **THEN** the command is rejected as unsupported in Memory v0

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

