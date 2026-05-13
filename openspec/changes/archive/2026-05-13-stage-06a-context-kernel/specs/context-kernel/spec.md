## ADDED Requirements

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
