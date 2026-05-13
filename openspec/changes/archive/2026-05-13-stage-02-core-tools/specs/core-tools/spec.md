## ADDED Requirements

### Requirement: Foundation tool protocol
The system SHALL provide a foundation-level tool protocol containing tool definitions, tool context, tool results, structured tool errors, provider raw tool calls, executable tool uses, runtime events, provider schema metadata, model-visible result formatting policy, and JSON-safe metadata types.

#### Scenario: Tool definition is declared
- **WHEN** a built-in coding tool is defined
- **THEN** it uses the shared foundation tool protocol rather than a provider-specific or UI-specific type

#### Scenario: Tool context is created
- **WHEN** the agent loop invokes a tool
- **THEN** the tool receives cwd, abort signal, session id, tool call id, and runtime event emitter fields through the shared context

#### Scenario: Tool result is returned
- **WHEN** a tool completes or fails
- **THEN** it returns a raw `ToolResult` with `ok`, concise output, optional JSON-safe metadata, and optional structured error

#### Scenario: Tool failure is structured
- **WHEN** a tool fails validation, lookup, timeout, interruption, parsing, permission, or execution
- **THEN** the failure includes a structured `error.kind` and concise message

#### Scenario: Executable tool use is declared
- **WHEN** the ReAct loop dispatches a model-requested tool
- **THEN** it uses an executable tool use with id, name, and parsed JSON object input

### Requirement: Built-in tool registry
The system SHALL provide a built-in coding tool registry that exposes `read_file`, `write_file`, `edit_file`, and `bash` with names, descriptions, input schemas, and executable handlers.

#### Scenario: Built-in tools are listed
- **WHEN** the default tool registry is created
- **THEN** it lists exactly the enabled built-in tools `read_file`, `write_file`, `edit_file`, and `bash`

#### Scenario: Provider schemas are requested
- **WHEN** the provider layer asks for enabled tool schemas
- **THEN** the registry returns provider-compatible schemas for each enabled built-in tool without exposing executable functions

### Requirement: Tool runner validates inputs and normalizes results
The system SHALL validate already parsed executable tool inputs against each tool schema before execution and SHALL convert validation failures, unknown tools, and execution exceptions into structured tool results.

#### Scenario: Tool input is valid
- **WHEN** a registered tool is invoked with input matching its schema
- **THEN** the runner executes the tool and returns its successful `ToolResult`

#### Scenario: Tool input is invalid
- **WHEN** a registered tool is invoked with input that fails schema validation
- **THEN** the runner returns a failed `ToolResult` containing `ok: false` and a concise validation error

#### Scenario: Tool input is not a JSON object
- **WHEN** a tool use reaches the runner with input that is not a parsed JSON object
- **THEN** the runner returns a failed `ToolResult` with a parse-related error kind and does not execute the tool

#### Scenario: Tool throws during execution
- **WHEN** a tool handler throws an exception during execution
- **THEN** the runner returns a failed `ToolResult` with `ok: false` instead of crashing the agent loop

#### Scenario: Tool name is unknown
- **WHEN** the model requests a tool name that is not registered
- **THEN** the runner returns a failed `ToolResult` with `ok: false` identifying the unknown tool

### Requirement: Tool results are formatted for model context
The system SHALL convert raw tool results into bounded model-visible content before those results are appended to provider continuation messages.

#### Scenario: Successful result is formatted
- **WHEN** a tool returns a successful raw `ToolResult`
- **THEN** `formatToolResultForModel` returns content that follows the tool's formatting policy and bounded output limits

#### Scenario: Failed result is formatted
- **WHEN** a tool returns a failed raw `ToolResult`
- **THEN** `formatToolResultForModel` returns model-visible content containing `ok:false`, `error.kind`, and a concise message

#### Scenario: Bash result is formatted
- **WHEN** `bash` returns raw metadata with stdout and stderr previews
- **THEN** the model-visible content includes command, exit code, previews, output byte count, and optional persisted output path without full uncapped output

#### Scenario: File edit result is formatted
- **WHEN** `edit_file` returns raw edit metadata
- **THEN** the model-visible content includes path, replacement count, and a concise diff summary without embedding the full file

### Requirement: Tool paths stay inside cwd
The system SHALL resolve file tool paths against the configured working directory and MUST reject paths that escape that directory.

#### Scenario: Relative path stays inside cwd
- **WHEN** a file tool receives a relative path that resolves inside the working directory
- **THEN** the tool may operate on that resolved path

#### Scenario: Path escapes cwd
- **WHEN** a file tool receives an absolute path or traversal path that resolves outside the working directory
- **THEN** the tool returns a failed `ToolResult` and does not read or write that path

### Requirement: read_file reads workspace text
The system SHALL provide a `read_file` tool that reads UTF-8 text files inside the working directory and returns a bounded text result.

#### Scenario: Text file is read
- **WHEN** `read_file` is invoked with a path to an existing text file inside cwd
- **THEN** the result contains the file content or a bounded preview and metadata identifying the resolved relative path

#### Scenario: Directory is requested
- **WHEN** `read_file` is invoked with a path to a directory
- **THEN** the result fails with a concise message that the path is a directory

#### Scenario: File is missing
- **WHEN** `read_file` is invoked with a path that does not exist
- **THEN** the result fails with a concise missing-file message

### Requirement: write_file writes workspace text
The system SHALL provide a `write_file` tool that writes UTF-8 text content to a file inside the working directory and returns a concise write summary.

#### Scenario: New file is written
- **WHEN** `write_file` is invoked with a valid cwd-contained path and content
- **THEN** the file is written and the result includes the relative path and byte count

#### Scenario: Parent directory is missing
- **WHEN** `write_file` is invoked for a path whose parent directory does not exist
- **THEN** the tool creates the parent directory inside cwd before writing the file

#### Scenario: Write path escapes cwd
- **WHEN** `write_file` is invoked with a path outside cwd
- **THEN** the tool returns a failed `ToolResult` and does not create or modify the file

### Requirement: edit_file performs exact text replacement
The system SHALL provide an `edit_file` tool that replaces exact UTF-8 text in a cwd-contained file using `oldString`, `newString`, and optional `replaceAll`.

#### Scenario: Unique match is replaced
- **WHEN** `edit_file` is invoked with an `oldString` that appears exactly once
- **THEN** the tool replaces it with `newString` and returns a summary of the edit

#### Scenario: Match is missing
- **WHEN** `edit_file` is invoked with an `oldString` that does not appear
- **THEN** the tool returns a failed `ToolResult` and leaves the file unchanged

#### Scenario: Multiple matches require replaceAll
- **WHEN** `edit_file` is invoked with an `oldString` that appears multiple times and `replaceAll` is not true
- **THEN** the tool returns a failed `ToolResult` and leaves the file unchanged

#### Scenario: replaceAll is true
- **WHEN** `edit_file` is invoked with an `oldString` that appears one or more times and `replaceAll` is true
- **THEN** the tool replaces every exact match and returns the replacement count

### Requirement: bash runs foreground commands with metadata
The system SHALL provide a `bash` tool that runs a foreground shell command with a timeout and returns stdout/stderr previews plus structured bash metadata.

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

### Requirement: Tool execution does not persist session data
The system SHALL execute Stage 02 tools without creating session transcripts, tool-result files, or background task records.

#### Scenario: Tool loop completes
- **WHEN** a Stage 02 tool-capable run completes
- **THEN** no session transcript, tool-result artifact, or background task record is written by the tool system
