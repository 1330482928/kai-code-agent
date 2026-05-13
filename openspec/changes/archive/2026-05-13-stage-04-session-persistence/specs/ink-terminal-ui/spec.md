## MODIFIED Requirements

### Requirement: Ink one-turn task entry

The system SHALL use an Ink-based session chat shell for bare `kai` prompt entry after model configuration is available, while preserving non-interactive fallback behavior.

#### Scenario: Config exists and bare kai starts
- **WHEN** the user runs `kai` with a valid model config in an interactive terminal
- **THEN** the system renders an Ink session chat shell instead of a one-turn-only task input view

#### Scenario: Task is submitted
- **WHEN** the user enters a prompt and submits it in the chat shell
- **THEN** the system records the prompt in the active session and runs the session-backed LLM loop with that prompt

#### Scenario: Multiple prompts are submitted
- **WHEN** the user submits another prompt after a turn completes
- **THEN** the chat shell keeps the same session active and runs another session-backed turn

### Requirement: Command mode remains scriptable

The system SHALL keep `kai run "<task>"`, fixture replay, resume commands, session listing, and config display usable without requiring an interactive Ink screen.

#### Scenario: Fixture run is executed
- **WHEN** the user runs `kai run --provider fixture --script fixtures/provider/basic-text.json "hello"`
- **THEN** the command prints the fixture response through normal stdout and does not render the setup TUI

#### Scenario: Session fixture run is executed
- **WHEN** the user runs `kai run --provider fixture --session new --script fixtures/session-alpha.json "remember alpha"`
- **THEN** the command prints through normal stdout/stderr and records a session transcript without rendering the chat shell

#### Scenario: Config show is executed
- **WHEN** the user runs `kai config show`
- **THEN** the command prints a plain text config summary suitable for shell output

#### Scenario: Sessions are listed
- **WHEN** the user runs `kai sessions`
- **THEN** the command prints a plain text session summary suitable for shell output

## ADDED Requirements

### Requirement: Ink chat shell is testable without a real terminal
The system SHALL separate chat shell state projection, input editing, and command handling from terminal rendering so tests can validate behavior without a real TTY.

#### Scenario: Chat state is projected
- **WHEN** tests provide transcript history and current-turn events
- **THEN** they can assert the chat shell state projection without mounting a real terminal session

#### Scenario: Input state is tested
- **WHEN** tests exercise text entry, cursor movement, history navigation, and slash picker state
- **THEN** they can assert pure state transitions without running an interactive terminal
