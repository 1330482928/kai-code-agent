# plan-mode Specification

## Purpose
TBD - created by archiving change stage-05-plan-mode. Update Purpose after archive.
## Requirements
### Requirement: Plan files are created and updated safely
The system SHALL provide a plan file store that creates and updates Markdown plan files under a project `.kai/plans/` directory when writable and falls back to `~/.kai-code-agent/plans/` when project-local storage is unavailable.

#### Scenario: Project plan path is available
- **WHEN** plan mode needs a new plan file and `.kai/plans/` can be created inside cwd
- **THEN** the plan store creates a Markdown plan file under `.kai/plans/` and records its path

#### Scenario: Project plan path is unavailable
- **WHEN** the project plan directory cannot be created or written
- **THEN** the plan store creates the plan file under the user-level plan directory

#### Scenario: Plan content is written
- **WHEN** the plan write tool receives Markdown content
- **THEN** the plan store writes only the active plan file and returns a concise plan path summary

### Requirement: Model can enter plan mode
The system SHALL provide a `plan_enter` tool that lets the model request a transition from build execution into plan profile execution.

#### Scenario: plan_enter is called from build profile
- **WHEN** the model calls `plan_enter` during a build-profile turn
- **THEN** the run records a profile transition request and subsequent planning execution uses the plan profile

#### Scenario: plan_enter is called while already planning
- **WHEN** the model calls `plan_enter` while the active profile is `plan`
- **THEN** the tool returns a successful no-op result identifying the current plan file

### Requirement: Plan guard restricts planning tools
The system SHALL enforce plan-profile permissions through middleware so planning can inspect code and write the plan file but cannot mutate workspace files or run non-readonly shell commands.

#### Scenario: Read tool is used in plan mode
- **WHEN** the active profile is `plan` and the model calls a read/search tool
- **THEN** the guard allows the tool to proceed

#### Scenario: Workspace write is requested in plan mode
- **WHEN** the active profile is `plan` and the model calls a workspace mutation tool such as `write_file` or `edit_file`
- **THEN** the guard returns a structured permission failure and the real tool is not executed

#### Scenario: Readonly bash is requested in plan mode
- **WHEN** the active profile is `plan` and the bash command matches the readonly allowlist
- **THEN** the guard allows bash execution through the normal runner

#### Scenario: Mutating bash is requested in plan mode
- **WHEN** the active profile is `plan` and the bash command is not classified as readonly
- **THEN** the guard returns a structured permission failure and the command is not executed

### Requirement: Plan exit requests human approval
The system SHALL provide a `plan_exit` tool that reads the active plan file and requests human approval before returning to build profile.

#### Scenario: Plan approval is granted
- **WHEN** `plan_exit` reads a non-empty plan and the user approves the plan approval request
- **THEN** the session records the approved plan, active profile switches to `build`, and the tool result indicates approval

#### Scenario: Plan approval is rejected
- **WHEN** `plan_exit` reads a non-empty plan and the user rejects the plan approval request
- **THEN** the session remains in `plan` profile and the tool result asks the model to revise the plan

#### Scenario: Plan file is empty
- **WHEN** `plan_exit` is called before any non-empty plan has been written
- **THEN** the tool returns a structured validation failure and does not request approval

#### Scenario: Approval cannot be rendered
- **WHEN** `plan_exit` needs approval in non-interactive mode without a prompt subscriber
- **THEN** it returns a structured interaction failure instead of waiting indefinitely

### Requirement: Approved plan is handed to build mode
The system SHALL inject the approved plan into the next build-profile provider context as explicit bounded context rather than ordinary assistant visible text.

#### Scenario: Build starts after approval
- **WHEN** a plan has been approved and the next run starts in build profile
- **THEN** the provider input includes explicit approved-plan context derived from the approved plan file

#### Scenario: Plan context is bounded
- **WHEN** an approved plan exceeds the Stage 05 plan context limit
- **THEN** the injected build context is truncated or summarized with a clear bounded marker

#### Scenario: Replay shows approval without hidden context leakage
- **WHEN** the session is replayed after plan approval
- **THEN** replay shows concise plan approval facts and does not render hidden thinking as plan text

### Requirement: Plan files can be inspected from command mode
The system SHALL provide a scriptable `kai plan open` command that reports the active or requested session plan file without requiring an interactive Ink screen.

#### Scenario: Plan open command has active plan
- **WHEN** the user runs `kai plan open --session <session-id>` for a session with a plan file
- **THEN** the CLI prints the plan path and bounded plan content or a concise open instruction

#### Scenario: Plan open command has no active plan
- **WHEN** the user runs `kai plan open --session <session-id>` for a session without a plan file
- **THEN** the CLI prints a concise no-active-plan error and exits without starting a provider request

#### Scenario: Plan open command is non-interactive
- **WHEN** `kai plan open` runs in command mode
- **THEN** it does not render the Ink chat shell and remains suitable for fixture tests

