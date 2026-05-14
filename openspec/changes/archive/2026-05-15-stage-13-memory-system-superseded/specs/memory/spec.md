## ADDED Requirements

### Requirement: Memory records are typed, statused, and sourced

The system SHALL store memory records with scope, type, status, source provenance, confidence, tags, and lifecycle timestamps so that long-term memory can be explained and managed explicitly.

#### Scenario: A memory record is created manually
- **WHEN** the user adds a memory record
- **THEN** the stored record includes stable id, scope, type, status `active`, text, source kind `manual`, confidence, and timestamps

#### Scenario: An extracted memory record is created
- **WHEN** the extraction pipeline produces a memory candidate that is accepted
- **THEN** the stored record includes source provenance for the producing session/message/tool and a lifecycle status

#### Scenario: Invalid memory metadata is rejected
- **WHEN** a memory write uses an unsupported scope, unsupported type, unsupported status, or empty text
- **THEN** the system returns a concise validation error and does not create or update a record

### Requirement: Memory retrieval is explainable and bounded

The system SHALL retrieve memory records using deterministic scoring with top-k limits, explanation output, and lifecycle-aware filtering.

#### Scenario: Retrieval ranks by score
- **WHEN** multiple visible records match a query
- **THEN** the retriever orders them by a bounded score that considers keyword overlap, scope fit, recency, confidence, and lifecycle state

#### Scenario: Retrieval explains why a record matched
- **WHEN** memory search or context injection returns a record
- **THEN** the system can provide a concise explanation of the score contribution and match reason

#### Scenario: Retrieval respects lifecycle state
- **WHEN** a record is stale or archived
- **THEN** the record is not injected by default into model context

### Requirement: Memory injection emits citations

The system SHALL inject memory into model input only through `ContextItem(kind="memory")` and SHALL record citations for memory that is actually injected.

#### Scenario: A memory item is injected
- **WHEN** the memory middleware contributes a memory ContextItem to the current run
- **THEN** the item includes memory metadata and the system records a citation entry for that injection

#### Scenario: Provider adapters remain memory agnostic
- **WHEN** memory context is included for a provider request
- **THEN** it reaches the provider only through `ModelInputBuilder` output and does not require provider adapter changes

### Requirement: Post-turn extraction is candidate-first

The system SHALL generate memory candidates after a turn using a constrained extraction flow and SHALL not write long-term memory directly from the transcript.

#### Scenario: Extraction produces candidates
- **WHEN** a turn ends and extraction is enabled
- **THEN** the system produces bounded memory candidates from transcript and tool outcomes

#### Scenario: Extraction does not auto-write raw transcript
- **WHEN** extraction runs
- **THEN** the system does not store the transcript or unreviewed raw text as long-term memory without policy approval

### Requirement: Secret guard blocks sensitive memory writes

The system SHALL reject memory candidates that contain secrets, tokens, cookies, keys, or other sensitive data before they can be persisted.

#### Scenario: Sensitive text is detected
- **WHEN** a candidate contains sensitive material or a high-risk path
- **THEN** the system blocks the memory write and returns a bounded diagnostic

### Requirement: Memory lifecycle is explicit

The system SHALL support memory lifecycle operations for stale, merge, archive, refresh, delete, and promote.

#### Scenario: A memory record becomes stale
- **WHEN** the user or policy marks a record stale
- **THEN** the record remains queryable but is no longer injected by default

#### Scenario: A memory record is archived
- **WHEN** the user archives a record
- **THEN** the record is retained for inspection but excluded from normal retrieval

#### Scenario: A memory record is merged
- **WHEN** duplicate or overlapping records are merged
- **THEN** the system preserves provenance and updates the surviving record deterministically

### Requirement: Memory CLI exposes explain, citations, extraction, and lifecycle operations

The system SHALL provide scriptable `kai memory` commands for inspecting explainability, citations, extraction, and lifecycle operations in addition to manual add/list/search/delete.

#### Scenario: Explain command is available
- **WHEN** the user runs `kai memory explain <query>`
- **THEN** stdout shows bounded matches and their score/reason breakdowns

#### Scenario: Citations command is available
- **WHEN** the user runs `kai memory citations <session-id>`
- **THEN** stdout shows citation records for memory injected during the session

#### Scenario: Extraction command is available
- **WHEN** the user runs `kai memory extract --session <session-id> --dry-run`
- **THEN** stdout lists bounded memory candidates without writing them

#### Scenario: Lifecycle commands are available
- **WHEN** the user runs `kai memory stale|merge|archive|refresh|promote|delete`
- **THEN** the command updates memory lifecycle state or rejects unsupported input with concise usage

### Requirement: Memory policy settings gate auto-extract and write scopes

The system SHALL load memory policy settings that control auto-extraction, default scope, and scope-level approval gates.

#### Scenario: Auto-extract is disabled
- **WHEN** memory policy disables auto extraction
- **THEN** post-turn extraction runs only in dry-run mode or manual approval mode

#### Scenario: Scope approval is required
- **WHEN** memory policy requires approval for a scope such as `user` or `project`
- **THEN** the system asks before writing that scope and does not bypass the approval gate
