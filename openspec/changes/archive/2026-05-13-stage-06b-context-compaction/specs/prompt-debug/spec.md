## ADDED Requirements

### Requirement: Prompt debug command inspects context without provider mutation
The system SHALL provide a scriptable `kai prompt --debug` command that builds the same ContextItems, budget plan, and ModelInput debug snapshot used by normal runs without sending a provider request or writing compaction summaries by default.

#### Scenario: Debug command runs for current workspace
- **WHEN** the user runs `kai prompt --debug "explain this repo"`
- **THEN** the command prints a prompt debug snapshot for the submitted task and exits without starting a provider completion

#### Scenario: Debug command inspects a session
- **WHEN** the user runs `kai prompt --debug --session <session-id> "continue"`
- **THEN** the command loads the stored transcript, projects it into ContextItems, appends the submitted task as the current user item, and prints the resulting budget plan

#### Scenario: Debug command is read-only by default
- **WHEN** the debug command determines that compaction would be required
- **THEN** it reports the compaction decision and affected items without appending a summary message or modifying the session transcript

### Requirement: Prompt debug output explains budget decisions
The system SHALL include item id, kind, source, priority, estimated tokens, inclusion status, and cut reason for each planned ContextItem in prompt debug output.

#### Scenario: Item is included
- **WHEN** a ContextItem fits within the configured budget
- **THEN** prompt debug marks the item as included and shows its estimated token count

#### Scenario: Item is cut
- **WHEN** a ContextItem is excluded by budget, replacement, emptiness, policy, or truncation
- **THEN** prompt debug marks the item as excluded and shows a stable cut reason

#### Scenario: Budget settings are shown
- **WHEN** prompt debug prints a snapshot
- **THEN** it includes max input tokens, reserved output tokens, compact threshold, estimated input tokens, and whether compaction would trigger

### Requirement: Prompt debug output is deterministic and scriptable
The system SHALL produce deterministic prompt debug output for identical inputs, workspace state, session transcript, budget options, and current date injection.

#### Scenario: Same input is inspected twice
- **WHEN** tests run prompt debug twice with the same fixture workspace and session
- **THEN** item ordering, cut reasons, and ModelInput summary fields are identical

#### Scenario: JSON output is requested
- **WHEN** the user runs `kai prompt --debug --json "task"`
- **THEN** the command prints a machine-readable snapshot containing budget, items, provider message summary, tool schema summary, and compaction decision fields

### Requirement: Prompt debug content display is bounded and safe
The system SHALL hide full item content by default, SHALL bound content previews when item display is requested, and SHALL redact known secrets and hidden thinking from prompt debug output.

#### Scenario: Item content is hidden by default
- **WHEN** the user runs `kai prompt --debug "task"` without item-content flags
- **THEN** the output shows item metadata and message summaries without printing full prompt, transcript, file, or tool-result content

#### Scenario: Bounded item previews are requested
- **WHEN** the user runs `kai prompt --debug --show-items "task"`
- **THEN** the output may show bounded item content previews while preserving redaction and size limits

#### Scenario: Secrets and thinking are present
- **WHEN** ContextItems or transcript parts contain API-key-like strings or hidden thinking parts
- **THEN** prompt debug redacts the secrets and does not print hidden thinking as ordinary item content
