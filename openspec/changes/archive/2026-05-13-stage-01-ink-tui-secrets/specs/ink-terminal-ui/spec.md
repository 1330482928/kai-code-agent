## ADDED Requirements

### Requirement: Ink first-run setup

The system SHALL use an Ink-based terminal UI for interactive first-run model setup when `kai` starts without a valid model config in an interactive terminal.

#### Scenario: Missing config starts TUI setup
- **WHEN** the user runs `kai` without a valid model config in an interactive terminal
- **THEN** the system renders an Ink setup flow instead of plain readline prompts

#### Scenario: Preset selection is visible
- **WHEN** the setup flow starts
- **THEN** the user can select `Minimax Global` or `Other` from an on-screen provider preset control

#### Scenario: Setup saves compatible config
- **WHEN** the user completes the Ink setup flow
- **THEN** the system saves the same Stage 01 config schema used by the existing provider adapter

### Requirement: Ink one-turn task entry

The system SHALL use an Ink-based terminal UI for bare `kai` task entry after model configuration is available.

#### Scenario: Config exists and bare kai starts
- **WHEN** the user runs `kai` with a valid model config
- **THEN** the system renders an Ink task input view instead of printing only `Task:`

#### Scenario: Task is submitted
- **WHEN** the user enters a task and submits it
- **THEN** the system runs the existing one-turn LLM loop with that task and streams the assistant response

### Requirement: Command mode remains scriptable

The system SHALL keep `kai run "<task>"`, fixture replay, and config display usable without requiring an interactive Ink screen.

#### Scenario: Fixture run is executed
- **WHEN** the user runs `kai run --provider fixture --script fixtures/provider/basic-text.json "hello"`
- **THEN** the command prints the fixture response through normal stdout and does not render the setup TUI

#### Scenario: Config show is executed
- **WHEN** the user runs `kai config show`
- **THEN** the command prints a plain text config summary suitable for shell output

### Requirement: TUI behavior is testable without a real terminal

The system SHALL separate TUI state transitions and config assembly from terminal rendering so tests can validate behavior without a real TTY.

#### Scenario: Setup state is tested
- **WHEN** tests exercise preset selection, API key entry, and model name entry
- **THEN** they can assert the resulting config object without mounting a real terminal session
