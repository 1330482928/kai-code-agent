# command-input Specification

## Purpose
TBD - created by archiving change stage-04-session-persistence. Update Purpose after archive.
## Requirements
### Requirement: Pure input editor
The system SHALL provide a pure input editor reducer for chat prompt text, cursor position, placeholder, and history navigation.

#### Scenario: Text is inserted
- **WHEN** an insert action is applied at the current cursor
- **THEN** the editor inserts the text and moves the cursor after the inserted text

#### Scenario: Cursor moves
- **WHEN** move-left or move-right actions are applied
- **THEN** the cursor changes within the bounds of the current text

#### Scenario: Character is deleted
- **WHEN** backspace or delete actions are applied
- **THEN** the editor removes the expected character and keeps cursor position valid

#### Scenario: History is navigated
- **WHEN** history previous or next actions are applied
- **THEN** the editor replaces text with the selected historical prompt and updates the history index

### Requirement: Command input state machine
The system SHALL translate keyboard input into editor actions, slash picker state, prompt submission, or turn abort commands.

#### Scenario: Slash picker opens
- **WHEN** the user types slash at an empty prompt
- **THEN** the command input state opens a slash picker using registered command entries

#### Scenario: Picker item is selected
- **WHEN** the user moves through picker items and accepts one with Tab or Enter
- **THEN** the state machine applies the selected command result as a local action, input transform, or prompt submission

#### Scenario: Escape is pressed
- **WHEN** the slash picker is open and the user presses Escape
- **THEN** the picker closes without submitting a prompt

#### Scenario: Ctrl-C is pressed
- **WHEN** a turn is running and the user presses Ctrl-C
- **THEN** the state machine emits an abort-turn command instead of inserting text

### Requirement: Command registry returns typed command results
The system SHALL provide a command registry whose commands return typed local actions, input transforms, or `PromptSubmission` values.

#### Scenario: Local command is executed
- **WHEN** a command such as `/help` or `/clear` resolves to a local action
- **THEN** the chat shell handles it without recording a user message or starting an agent turn

#### Scenario: Context command submits metadata
- **WHEN** a command such as `/plan`, `/model`, `/mode`, or `/skill` resolves to a prompt submission
- **THEN** the submission includes text plus metadata for the next agent run context

#### Scenario: Resume command is executed
- **WHEN** `/resume <session-id>` resolves
- **THEN** the command result identifies the requested session id without treating the command text as ordinary model input

### Requirement: PromptSubmission metadata is recorded
The system SHALL preserve prompt submission metadata with the submitted user prompt so future stages can inspect mode, profile, model, skill, and resume intent.

#### Scenario: Plain prompt is submitted
- **WHEN** the user submits ordinary text
- **THEN** the prompt submission contains the text and no slash command metadata

#### Scenario: Slash prompt is submitted
- **WHEN** the user submits through a context slash command
- **THEN** the user message metadata records the slash command and selected run context metadata

### Requirement: Plan slash commands produce typed results
The system SHALL implement concrete `/plan` slash command behavior that can request plan profile execution or inspect the active plan without treating slash text as ordinary model input.

#### Scenario: Plan prompt is submitted
- **WHEN** the user submits `/plan investigate the bug`
- **THEN** command input emits a `PromptSubmission` with text `investigate the bug` and metadata containing `slashCommand: "plan"` and `requestedProfile: "plan"`

#### Scenario: Empty plan prompt is submitted
- **WHEN** the user submits `/plan` without prompt text
- **THEN** command input emits a `PromptSubmission` requesting profile `plan` with an empty or default planning prompt that the chat shell can validate before running

#### Scenario: Plan open is selected
- **WHEN** the user invokes `/plan open`
- **THEN** command input emits a local action for opening or displaying the active plan file and does not record a user message

#### Scenario: Plan command appears in picker
- **WHEN** the slash picker is open
- **THEN** `/plan` is listed with enough metadata for tests to distinguish plan submission from local-only commands

