## MODIFIED Requirements

### Requirement: Built-in tool registry
The system SHALL provide a built-in tool registry that exposes `read_file`, `write_file`, `edit_file`, `bash`, and `ask_user_question` with names, descriptions, input schemas, and executable handlers.

#### Scenario: Built-in tools are listed
- **WHEN** the default tool registry is created
- **THEN** it lists the enabled built-in tools `read_file`, `write_file`, `edit_file`, `bash`, and `ask_user_question`

#### Scenario: Provider schemas are requested
- **WHEN** the provider layer asks for enabled tool schemas
- **THEN** the registry returns provider-compatible schemas for each enabled built-in tool without exposing executable functions

### Requirement: bash runs foreground commands with metadata
The system SHALL provide a `bash` tool that runs a foreground shell command with a timeout, emits runtime progress events, and returns stdout/stderr previews plus structured bash metadata.

#### Scenario: Command succeeds
- **WHEN** `bash` is invoked with a short command that exits successfully
- **THEN** the result succeeds and includes stdout preview, stderr preview, `exitCode`, `interrupted: false`, and output byte count in `metadata.bash`

#### Scenario: Command fails
- **WHEN** `bash` is invoked with a command that exits non-zero
- **THEN** the result completes with bash metadata containing the non-zero `exitCode`

#### Scenario: Command times out
- **WHEN** `bash` is invoked with a command that exceeds its timeout
- **THEN** the command is interrupted and the result includes `interrupted: true` and `exitCode: null` in `metadata.bash`

#### Scenario: Output is large
- **WHEN** `bash` produces output larger than the preview limit
- **THEN** the result includes bounded stdout/stderr previews and records the total output byte count

#### Scenario: Progress is emitted
- **WHEN** `bash` receives output while the command is still running
- **THEN** it emits `bash_progress` runtime events through `ToolContext.emit`

## ADDED Requirements

### Requirement: ask_user_question requests structured user input
The system SHALL provide an `ask_user_question` tool that sends structured questions through HumanInteractionManager and returns structured answers.

#### Scenario: Valid question input is received
- **WHEN** `ask_user_question` is invoked with valid question definitions
- **THEN** the tool enqueues a human interaction request and waits for a structured answer

#### Scenario: User answer is returned
- **WHEN** the pending question request is resolved
- **THEN** the tool returns a successful `ToolResult` containing the selected answers

#### Scenario: Question input is invalid
- **WHEN** `ask_user_question` input fails schema validation
- **THEN** the runner returns a failed `ToolResult` and no prompt is enqueued

