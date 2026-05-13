# context-kernel Specification

## Purpose
TBD - created by archiving change stage-06a-context-kernel. Update Purpose after archive.
## Requirements
### Requirement: Context items represent model-visible context
The system SHALL represent every non-tool-schema contribution to provider input as a `ContextItem` with stable id, kind, source, content, priority, estimated token metadata, inclusion metadata, and optional structured metadata.

#### Scenario: Context item is created
- **WHEN** profile, instruction, runtime, history, current user, or plan context is prepared for a model request
- **THEN** the context is represented as a `ContextItem` before it is assembled into provider input

#### Scenario: Empty context is ignored
- **WHEN** a context producer has no content to contribute
- **THEN** it returns no item or an item marked excluded with an `empty` cut reason instead of emitting an empty provider message

#### Scenario: Future context kind is reserved
- **WHEN** later stages add skill, memory, permission, or sub-agent context
- **THEN** those capabilities can use the existing ContextItem contract without changing provider adapter APIs

### Requirement: Context producers emit deterministic items
The system SHALL provide deterministic context producers for base Kai instructions, active agent profile, project instruction files, runtime environment, transcript history, current user input, and approved plan context.

#### Scenario: Base and profile items are produced
- **WHEN** a build or plan run starts
- **THEN** the context kernel emits base and profile ContextItems in a stable order before history and user items

#### Scenario: Instruction files are discovered
- **WHEN** `AGENTS.md`, `CLAUDE.md`, or `CONTEXT.md` exists between the current working directory and project root
- **THEN** the instruction loader emits instruction ContextItems with source paths and deterministic ordering

#### Scenario: Runtime context is produced
- **WHEN** a run starts in a workspace
- **THEN** runtime ContextItems include bounded environment facts such as cwd, current date, and git summary when available

#### Scenario: Current user item is produced
- **WHEN** the user submits a task or PromptSubmission
- **THEN** the current user prompt is represented as a ContextItem carrying prompt metadata before provider input assembly

### Requirement: ModelInputBuilder is the provider input assembly boundary
The system SHALL assemble provider-facing input through `ModelInputBuilder`, which consumes ContextItems, enabled provider tool schemas, model name, and generation defaults to produce the `ProviderInput` sent to adapters.

#### Scenario: Provider input is built
- **WHEN** the run loop is ready to call the provider
- **THEN** it invokes ModelInputBuilder and sends the resulting provider input to the provider adapter

#### Scenario: Stable item order is preserved
- **WHEN** the same ContextItems and tool schemas are provided to the builder
- **THEN** the resulting system messages, conversation messages, tools, and debug item order are deterministic

#### Scenario: Tool schemas are attached
- **WHEN** the active profile exposes provider tool schemas
- **THEN** ModelInputBuilder includes those schemas in provider input without converting them into text context

#### Scenario: Provider adapters remain context agnostic
- **WHEN** a provider adapter receives input
- **THEN** it receives the existing provider input shape and does not need to understand ContextItem internals

### Requirement: Context debug metadata is available without user-facing debug CLI
The system SHALL compute builder debug metadata for each ContextItem, including estimated tokens, inclusion status, source, priority, and cut reason when excluded, while deferring user-facing prompt debug commands to Stage 06B.

#### Scenario: Debug metadata is inspected in tests
- **WHEN** tests build model input from ContextItems
- **THEN** they can assert included items, estimated token totals, and sources without running an interactive CLI

#### Scenario: No compaction occurs in Stage 06A
- **WHEN** context exceeds a configured rough budget during Stage 06A
- **THEN** the builder records token estimates and inclusion metadata but does not summarize or delete transcript history

### Requirement: Context assembly preserves safety boundaries
The system SHALL preserve existing hidden-thinking, executable-tool, and formatted-tool-result boundaries when projecting ContextItems into provider messages.

#### Scenario: Hidden thinking is present in transcript
- **WHEN** transcript history contains thinking parts
- **THEN** ContextItem projection excludes hidden thinking from default model-visible assistant text

#### Scenario: Tool result is present in transcript
- **WHEN** transcript history contains tool result parts
- **THEN** ContextItem projection uses the stored model-visible tool result content rather than raw unformatted output

#### Scenario: Partial tool arguments exist only in provider stream
- **WHEN** provider tool-call deltas have not assembled into executable tool use
- **THEN** ContextItem assembly does not create executable tool history from partial fragments

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

