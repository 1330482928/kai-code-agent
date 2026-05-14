# cli Specification

## Purpose
TBD - created by archiving change stage-14-polish. Update Purpose after archive.

## Requirements

### Requirement: CLI diagnostics are available

The system SHALL provide a `kai doctor` command that reports environment and dependency health needed for normal operation.

#### Scenario: Doctor checks prerequisites
- **WHEN** the user runs `kai doctor`
- **THEN** the CLI reports whether key prerequisites such as settings, model config, provider availability, and runtime dependencies are available

#### Scenario: Doctor reports actionable issues
- **WHEN** a prerequisite is missing or invalid
- **THEN** the CLI reports the issue with a concise, actionable message

### Requirement: Settings are explainable

The system SHALL provide a `kai settings explain` command that shows layered settings sources and the effective merged result.

#### Scenario: Settings layers are shown
- **WHEN** the user runs `kai settings explain`
- **THEN** the CLI shows user, project, and project-local settings sources, whether each exists, and the effective merged result

#### Scenario: Local settings are identified
- **WHEN** the effective settings include project-local overrides
- **THEN** the CLI makes it clear that the project-local file is expected to be gitignored

### Requirement: Background tasks are inspectable

The system SHALL expose long-running bash tasks as queryable CLI records.

#### Scenario: Tasks are listed
- **WHEN** the user runs `kai tasks list`
- **THEN** the CLI lists known background tasks with status and output hints

#### Scenario: Task output is readable
- **WHEN** the user runs `kai tasks read <task-id>`
- **THEN** the CLI shows task output or the persisted output location if the output was truncated

### Requirement: Debug output remains opt-in

The system SHALL support JSONL debug output for troubleshooting without changing normal CLI output.

#### Scenario: Debug logging is enabled
- **WHEN** the user enables debug JSONL output
- **THEN** the CLI writes structured debug events for the current run

#### Scenario: Normal output stays clean
- **WHEN** debug output is disabled
- **THEN** the CLI continues to present normal user output without debug noise

### Requirement: Bun binary release is supported

The system SHALL support building a runnable local binary using Bun compile.

#### Scenario: Binary build succeeds
- **WHEN** the user runs the documented Bun compile command
- **THEN** the build produces a runnable binary artifact

### Requirement: Error and help text are polished

The system SHALL provide concise, actionable errors and help text for the Stage 14 CLI surface.

#### Scenario: Unknown command is rejected
- **WHEN** the user invokes an unsupported command
- **THEN** the CLI reports a short usage-oriented error

#### Scenario: Help text is stable
- **WHEN** the user asks for help on the Stage 14 CLI surface
- **THEN** the help output reflects the documented commands and examples
