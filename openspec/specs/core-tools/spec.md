# core-tools Specification

## Purpose
TBD - created by archiving change stage-02-core-tools. Update Purpose after archive.
## Requirements
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
The system SHALL provide a built-in tool registry that exposes `read_file`, `write_file`, `edit_file`, `grep`, `glob`, `apply_patch`, `bash`, and `ask_user_question` with names, descriptions, input schemas, and executable handlers.

#### Scenario: Built-in tools are listed
- **WHEN** the default tool registry is created
- **THEN** it lists the enabled built-in tools `read_file`, `write_file`, `edit_file`, `grep`, `glob`, `apply_patch`, `bash`, and `ask_user_question`

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

### Requirement: Tool execution does not persist session data
The system SHALL execute Stage 02 tools without creating session transcripts, tool-result files, or background task records.

#### Scenario: Tool loop completes
- **WHEN** a Stage 02 tool-capable run completes
- **THEN** no session transcript, tool-result artifact, or background task record is written by the tool system

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

### Requirement: Tool registry supports profile-specific tool sets
The system SHALL compose tool registries for build and plan profiles without changing the foundation tool protocol or existing built-in tool contracts.

#### Scenario: Build registry is created
- **WHEN** the build profile registry is requested
- **THEN** it includes normal coding tools and plan entry capability while preserving existing built-in tool behavior

#### Scenario: Plan registry is created
- **WHEN** the plan profile registry is requested
- **THEN** it includes only plan-safe tools and excludes general workspace mutation tools

#### Scenario: Provider schemas are profile scoped
- **WHEN** provider schemas are requested from a profile registry
- **THEN** only tools enabled for that profile are serialized

### Requirement: Plan tools return structured tool results
The system SHALL implement plan tools using the shared `ToolDef`, `ToolContext`, `ToolResult`, validation, and model-visible formatting path.

#### Scenario: plan_enter returns a result
- **WHEN** `plan_enter` executes successfully
- **THEN** it returns a successful `ToolResult` with JSON-safe metadata describing the target profile and plan file if available

#### Scenario: plan_write returns a result
- **WHEN** `plan_write` writes Markdown content to the active plan file
- **THEN** it returns a successful `ToolResult` with JSON-safe metadata containing the plan path and byte count

#### Scenario: plan_exit returns a result
- **WHEN** `plan_exit` completes an approval flow
- **THEN** it returns a `ToolResult` whose metadata identifies approval status, plan path, and next profile

#### Scenario: Plan tool input is invalid
- **WHEN** a plan tool receives invalid input
- **THEN** the existing tool runner returns a structured validation failure and no plan state is changed

### Requirement: grep searches workspace text with bounded results
The system SHALL provide a `grep` tool that searches UTF-8 workspace text using ripgrep from the current working directory and returns structured, bounded match results.

#### Scenario: Pattern matches files
- **WHEN** `grep` is invoked with a pattern that matches text in files under cwd
- **THEN** the result includes relative file paths, one-based line numbers, bounded line previews, match count metadata, and model-visible summary output

#### Scenario: Pattern has no matches
- **WHEN** `grep` is invoked with a pattern that matches no files
- **THEN** the tool succeeds with an empty match list and a concise no-matches summary

#### Scenario: Result limit is reached
- **WHEN** more matches exist than the configured or default result limit
- **THEN** the tool returns only the bounded result set and includes truncation metadata indicating more matches were available

#### Scenario: Search path escapes cwd
- **WHEN** `grep` is invoked with a path or include root that resolves outside the working directory
- **THEN** the tool returns a failed `ToolResult` and does not search outside cwd

#### Scenario: ripgrep is unavailable
- **WHEN** the ripgrep executable cannot be started
- **THEN** the tool returns a structured failed `ToolResult` instead of crashing the agent loop

### Requirement: glob lists workspace files with bounded results
The system SHALL provide a `glob` tool that lists files under cwd using ripgrep file discovery and filters them with a supported glob pattern.

#### Scenario: Glob pattern matches files
- **WHEN** `glob` is invoked with a pattern that matches files under cwd
- **THEN** the result includes sorted relative file paths and metadata describing the number of returned files

#### Scenario: Glob pattern has no matches
- **WHEN** `glob` is invoked with a pattern that matches no files
- **THEN** the tool succeeds with an empty file list and a concise no-matches summary

#### Scenario: Glob result limit is reached
- **WHEN** more files match than the configured or default result limit
- **THEN** the tool returns only the bounded result set and includes truncation metadata indicating more files were available

#### Scenario: Glob path escapes cwd
- **WHEN** `glob` is invoked with a base path or pattern that would resolve outside cwd
- **THEN** the tool returns a failed `ToolResult` and does not list files outside cwd

### Requirement: apply_patch parses structured patch input
The system SHALL provide an `apply_patch` tool that parses Codex-style patch input into add, delete, update, and optional move operations before any file is modified.

#### Scenario: Add file patch is parsed
- **WHEN** the patch contains `*** Add File: <path>` followed by added lines
- **THEN** the parser produces an add-file operation with the target path and content

#### Scenario: Delete file patch is parsed
- **WHEN** the patch contains `*** Delete File: <path>`
- **THEN** the parser produces a delete-file operation for the target path

#### Scenario: Update file patch is parsed
- **WHEN** the patch contains `*** Update File: <path>` with context, removed, and added lines
- **THEN** the parser produces an update operation preserving ordered hunks

#### Scenario: Move target is parsed
- **WHEN** an update patch contains `*** Move to: <path>`
- **THEN** the parser attaches the destination path to the update operation

#### Scenario: Patch markers are missing
- **WHEN** patch input does not contain valid `*** Begin Patch` and `*** End Patch` markers
- **THEN** the tool returns a structured parse failure and does not modify files

### Requirement: apply_patch applies plans atomically inside cwd
The system SHALL apply a parsed patch plan only after every operation passes path, existence, conflict, and hunk-match validation, and SHALL leave all files unchanged if any validation or application step fails.

#### Scenario: Patch adds a file
- **WHEN** `apply_patch` adds a new cwd-contained file whose parent directory can be created
- **THEN** the file is written and the result includes the relative path in touched file metadata

#### Scenario: Patch deletes a file
- **WHEN** `apply_patch` deletes an existing cwd-contained file
- **THEN** the file is removed and the result includes the relative path in touched file metadata

#### Scenario: Patch updates a file
- **WHEN** `apply_patch` updates an existing cwd-contained file and all hunks match
- **THEN** the file content is updated and the result includes a concise change summary

#### Scenario: Patch moves a file
- **WHEN** `apply_patch` updates a file with a valid `Move to` destination
- **THEN** the source file is moved to the destination after hunks are applied

#### Scenario: Patch path escapes cwd
- **WHEN** any patch operation references a source or destination path outside cwd
- **THEN** the tool fails and no patch operation writes, deletes, or moves any file

#### Scenario: Patch hunk does not match
- **WHEN** any update hunk cannot be matched in its target file
- **THEN** the tool fails and all target files remain unchanged

#### Scenario: Patch has conflicting operations
- **WHEN** a patch attempts incompatible operations such as adding an existing file or deleting a missing file
- **THEN** the tool fails with a structured error and all target files remain unchanged

### Requirement: Search and patch tools format model-visible results
The system SHALL format `grep`, `glob`, and `apply_patch` tool results into concise model-visible output that includes structured status, bounded previews, and relevant metadata without embedding unbounded file content.

#### Scenario: Search result is formatted
- **WHEN** `grep` or `glob` returns results
- **THEN** the model-visible tool result contains a concise result list and truncation status when applicable

#### Scenario: Patch result is formatted
- **WHEN** `apply_patch` succeeds
- **THEN** the model-visible tool result contains touched files, operation counts, and a concise summary instead of full file contents

#### Scenario: Patch failure is formatted
- **WHEN** `apply_patch` fails during parse, path validation, or hunk matching
- **THEN** the model-visible tool result contains `ok:false`, `error.kind`, and a concise diagnostic suitable for provider continuation

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

### Requirement: Tool registries support dynamic external tools

The system SHALL compose dynamic external `ToolDef`s with built-in tools without changing the foundation tool protocol, provider schema shape, runner validation path, or model-visible result formatting path.

#### Scenario: Dynamic tool is registered with built-in tools
- **WHEN** a profile registry is created with built-in tools and dynamic MCP-backed tools
- **THEN** the registry lists both sets using the shared `ToolDef` interface

#### Scenario: Dynamic tool provider schema is serialized
- **WHEN** provider schemas are requested from a registry that contains a dynamic MCP-backed tool
- **THEN** the schema includes the dynamic tool name, description, and JSON Schema parameters without exposing executable functions

#### Scenario: Dynamic tool is executed by the normal runner
- **WHEN** the model calls a registered dynamic MCP-backed tool with parsed JSON object input
- **THEN** the existing runner executes the tool handler and returns its `ToolResult`

#### Scenario: Dynamic tool result is formatted normally
- **WHEN** a dynamic MCP-backed tool returns a raw `ToolResult`
- **THEN** `formatToolResultForModel` applies the tool's format policy and bounded output limits before model continuation

#### Scenario: Dynamic tool profile filtering is conservative
- **WHEN** profile-specific registries are composed for build and plan profiles
- **THEN** dynamic MCP-backed tools are included only in profiles whose policy explicitly allows them

