## ADDED Requirements

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
