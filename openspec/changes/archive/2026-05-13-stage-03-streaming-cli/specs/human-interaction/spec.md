## ADDED Requirements

### Requirement: Human interaction manager queues prompts
The system SHALL provide a HumanInteractionManager that queues human interaction requests and resolves them through subscribers without coupling tools or middleware to Ink components.

#### Scenario: Request is enqueued
- **WHEN** a tool or middleware enqueues a human interaction request
- **THEN** the manager returns a promise and notifies subscribers with a pending request id, kind, and payload

#### Scenario: Request is resolved
- **WHEN** a subscriber resolves a pending request id with a result
- **THEN** the original enqueue promise resolves with that structured result

#### Scenario: Request is rejected
- **WHEN** a subscriber rejects a pending request id or the turn is aborted
- **THEN** the original enqueue promise rejects and the request is removed from the queue

### Requirement: Approval prompt flow
The system SHALL support approval requests through HumanInteractionManager and provide plain and Ink-compatible prompt subscribers.

#### Scenario: Approval is granted
- **WHEN** approval middleware enqueues a request and the user approves it
- **THEN** the middleware allows the tool execution to continue

#### Scenario: Approval is denied
- **WHEN** approval middleware enqueues a request and the user denies it
- **THEN** the middleware returns a failed `ToolResult` and the real tool is not executed

#### Scenario: Non-interactive approval cannot prompt
- **WHEN** approval is required in a non-interactive command mode without a prompt subscriber
- **THEN** the middleware returns a failed `ToolResult` instead of hanging

### Requirement: ask_user_question tool
The system SHALL provide an `ask_user_question` tool that lets the model ask structured questions and receive structured answers.

#### Scenario: Question is asked
- **WHEN** the model calls `ask_user_question` with one or more valid questions
- **THEN** the tool enqueues a question request through HumanInteractionManager

#### Scenario: User answers
- **WHEN** the user answers the pending question request
- **THEN** the tool returns a successful `ToolResult` containing the selected answers

#### Scenario: Question request is aborted
- **WHEN** the turn is aborted while a question request is pending
- **THEN** the tool returns or propagates an interrupted result and no stale prompt remains pending

### Requirement: HITL requests emit UI events
The system SHALL emit current-turn UI events when approval or question requests become pending.

#### Scenario: Approval request event is emitted
- **WHEN** an approval request is queued
- **THEN** the current turn emits an `approval_request` UI event with id, title, and body

#### Scenario: Question request event is emitted
- **WHEN** an `ask_user_question` request is queued
- **THEN** the current turn emits a `question_request` UI event with request id and question payload

