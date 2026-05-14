## ADDED Requirements

### Requirement: Sub-agent definitions are discoverable from markdown frontmatter

The system SHALL discover sub-agent definitions from `.kai/agents/*.md` files and expose their metadata without running the child agent.

#### Scenario: Agent definition is listed
- **WHEN** the user runs `kai agents list`
- **THEN** the system lists available agent definitions with their name, description, tools, and source path

#### Scenario: Definition metadata is bounded
- **WHEN** the system reads an agent definition
- **THEN** it uses the frontmatter metadata and a bounded prompt body rather than loading unrelated transcript state

### Requirement: Sub-agent tool runs child agents in an isolated context

The system SHALL provide a `sub_agent` tool that creates a child agent run with a bounded task, a child prompt, and an explicit tool allowlist.

#### Scenario: Child agent is invoked
- **WHEN** the parent agent calls `sub_agent` with a definition and a task
- **THEN** the system starts an isolated child run using that definition

#### Scenario: Child tool allowlist is enforced
- **WHEN** the child agent requests a tool that is not in the definition allowlist
- **THEN** the system rejects the request and does not grant the tool

#### Scenario: Child agent has a max turn cap
- **WHEN** the child agent exceeds its configured turn limit
- **THEN** the child run stops and returns the bounded result collected so far

### Requirement: Sub-agent side transcripts are persisted separately

The system SHALL persist child-agent execution in a side transcript that is separate from the parent transcript.

#### Scenario: Side transcript is recorded
- **WHEN** a child agent run completes
- **THEN** the system stores a side transcript identifier and the child run remains inspectable

#### Scenario: Parent does not inherit full child transcript
- **WHEN** the parent agent continues after a child run
- **THEN** the parent does not automatically receive the full child transcript as model-visible context

### Requirement: Sub-agent results are handed back as ContextItems

The system SHALL project sub-agent results into the parent context only as `ContextItem(kind="subagent")` entries before `ModelInputBuilder` assembles provider input.

#### Scenario: Summary is injected into parent context
- **WHEN** the child run returns summary, changed files, and open questions
- **THEN** the parent receives that data as a `ContextItem(kind="subagent")`

#### Scenario: Full child transcript is not injected
- **WHEN** a child run completes
- **THEN** the parent context does not include the full side transcript as ordinary history context

#### Scenario: Context kernel remains the only provider boundary
- **WHEN** a parent run includes sub-agent context
- **THEN** the sub-agent result reaches the provider only through `ModelInputBuilder`

