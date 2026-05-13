## ADDED Requirements

### Requirement: Chat shell displays active profile and plan state
The system SHALL display concise active profile and plan status in the session-backed chat shell without making UI state the source of truth.

#### Scenario: Chat is in build profile
- **WHEN** the active session profile is `build`
- **THEN** the chat shell shows build mode status and keeps accepting normal prompts

#### Scenario: Chat is in plan profile
- **WHEN** the active session profile is `plan`
- **THEN** the chat shell shows plan mode status and the active plan path when available

#### Scenario: Profile changes
- **WHEN** profile metadata changes after `/plan`, `plan_enter`, or `plan_exit`
- **THEN** the chat shell refreshes status from session/run state rather than from stale local UI state

### Requirement: Chat shell supports plan local actions
The system SHALL handle plan local actions such as `/plan open` without recording them as user transcript messages or starting model turns.

#### Scenario: Plan file is opened in chat
- **WHEN** the user invokes `/plan open` in chat
- **THEN** the shell displays or reports the active plan file path through a local action result

#### Scenario: No plan file exists
- **WHEN** the user invokes `/plan open` before a plan file exists
- **THEN** the shell shows a concise no-active-plan message and remains ready for input

### Requirement: Chat shell projects plan approval facts
The system SHALL project plan approval facts from transcript/session data rather than from live approval UI events.

#### Scenario: Approved plan appears in history
- **WHEN** a loaded transcript contains an approved plan event
- **THEN** the shell displays a concise approved-plan summary and plan path

#### Scenario: Rejected plan appears in history
- **WHEN** a loaded transcript contains a rejected plan event
- **THEN** the shell displays a concise rejected-plan summary without showing hidden thinking
