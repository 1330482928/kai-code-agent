## ADDED Requirements

### Requirement: Context budget planner records inclusion decisions
The system SHALL plan model-visible context against a configurable `ContextBudget` before provider input is built, recording estimated tokens, inclusion status, and stable cut reasons for every ContextItem.

#### Scenario: Context fits within budget
- **WHEN** total estimated input tokens plus reserved output tokens remain within the configured budget
- **THEN** the budget planner marks eligible ContextItems as included and preserves their deterministic order

#### Scenario: Context exceeds budget
- **WHEN** total estimated input tokens exceed the compact threshold or configured max input tokens
- **THEN** the budget planner marks lower-priority or replaceable ContextItems as excluded or truncated with stable cut reasons

#### Scenario: Sticky context is planned
- **WHEN** a required base, profile, current user, approved plan, or protected tool-continuation ContextItem is marked sticky
- **THEN** the budget planner keeps it ahead of lower-priority optional context unless the whole request is impossible to fit

#### Scenario: Per-kind cap applies
- **WHEN** a ContextItem kind has a configured per-kind max token budget
- **THEN** the planner enforces that cap deterministically and records truncation or exclusion metadata when the cap is exceeded

### Requirement: Compaction creates summary context items
The system SHALL create a `summary` ContextItem from compacted transcript history when historical ContextItems exceed the compaction threshold and the run is allowed to compact.

#### Scenario: Summary is produced
- **WHEN** older transcript history is selected for compaction
- **THEN** the compaction result includes a `summary` ContextItem with stable source metadata, estimated tokens, and bounded content

#### Scenario: Summary schema is stable
- **WHEN** a compaction summary is generated
- **THEN** its model-visible content uses the fixed sections `Current Goal`, `Progress`, `Decisions / Constraints`, `Critical Files / Commands / Errors`, and `Remaining Work`

#### Scenario: Original history is replaced in model input
- **WHEN** compacted history has a summary ContextItem
- **THEN** provider input assembly uses the summary item plus retained recent tail instead of projecting all compacted history messages as ordinary visible history

### Requirement: Tool-pair-aware tail selection
The system SHALL select retained history tail using turn or segment boundaries that preserve assistant tool-call and matching tool-result continuity.

#### Scenario: Complete tool pair is near the tail
- **WHEN** a matching assistant tool call and tool result fit in the retained tail
- **THEN** tail selection keeps both parts together with their tool call id and model-visible tool result content

#### Scenario: Budget boundary splits a tool pair
- **WHEN** a budget boundary would keep only the assistant tool call or only the matching tool result
- **THEN** tail selection either keeps the complete pair together or moves the complete pair into compacted history

#### Scenario: Pending tool state is present
- **WHEN** transcript history contains a pending or incomplete tool continuation required for provider validity
- **THEN** the planner treats that state as protected context and does not emit a provider input with an invalid orphaned tool continuation

### Requirement: Context debug snapshots include compaction details
The system SHALL expose debug snapshot metadata for budget plans and compaction decisions in a deterministic shape suitable for golden tests and prompt debug output.

#### Scenario: Snapshot includes budget plan
- **WHEN** ModelInputBuilder receives a planned set of ContextItems
- **THEN** the debug snapshot includes budget values, estimated totals, item decisions, cut reasons, and retained tail metadata

#### Scenario: Snapshot includes compaction decision
- **WHEN** compaction is required, skipped, or already represented by an existing summary
- **THEN** the debug snapshot records the decision, reason, compacted item ids, summary item id when present, and preserved item ids
