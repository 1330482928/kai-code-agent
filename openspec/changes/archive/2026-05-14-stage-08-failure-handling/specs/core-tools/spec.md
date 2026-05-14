## ADDED Requirements

### Requirement: Bash failures are normalized
The system SHALL normalize `bash` timeout, abort, and non-zero exit outcomes into structured `ToolResult` metadata with bounded output previews.

#### Scenario: Bash command exits non-zero
- **WHEN** `bash` runs a command that exits with a non-zero status before timeout or abort
- **THEN** the tool returns a completed result containing the non-zero `exitCode`, `interrupted:false`, bounded stdout/stderr previews, and output byte count

#### Scenario: Bash command times out
- **WHEN** `bash` exceeds its configured timeout
- **THEN** the tool interrupts the process and returns a failed `ToolResult` with `error.kind` of `timeout`, `interrupted:true`, `exitCode:null`, and bounded output previews

#### Scenario: Bash command is aborted
- **WHEN** the run abort signal is triggered while `bash` is running
- **THEN** the tool interrupts the process and returns a failed `ToolResult` with `error.kind` of `interrupted`, `interrupted:true`, `exitCode:null`, and bounded output previews

#### Scenario: Bash output is large during failure
- **WHEN** a failed or interrupted bash command writes large stdout or stderr
- **THEN** model-visible and transcript metadata include only bounded previews plus output byte count

### Requirement: Tool failure normalization is reusable
The system SHALL provide shared helpers for converting thrown errors, provider failures, aborts, parse errors, and tool execution failures into concise structured tool or run-loop diagnostics.

#### Scenario: Unknown error is normalized
- **WHEN** a non-Error value or unexpected exception reaches a failure boundary
- **THEN** the system converts it into a concise structured diagnostic instead of exposing raw object dumps

#### Scenario: Abort error is normalized
- **WHEN** an abort-related error reaches a failure boundary
- **THEN** the system classifies it as interrupted and preserves a concise user-facing message

#### Scenario: Provider error is normalized for a tool result
- **WHEN** recovery must create a failed tool result because provider streaming failed after tool intent
- **THEN** the created result uses a structured error kind and bounded diagnostic details
