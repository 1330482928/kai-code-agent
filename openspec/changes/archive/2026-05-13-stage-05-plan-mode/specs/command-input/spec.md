## ADDED Requirements

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
