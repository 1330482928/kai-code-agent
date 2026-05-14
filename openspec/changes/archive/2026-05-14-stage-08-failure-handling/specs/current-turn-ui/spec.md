## ADDED Requirements

### Requirement: Failure UI events are concise and bounded
The system SHALL project provider, recovery, bash timeout, and abort failures into renderer-agnostic current-turn UI events or existing boundary events with concise bounded summaries.

#### Scenario: Provider failure reaches UI
- **WHEN** a provider failure ends the turn
- **THEN** the plain and Ink renderers show a concise user-facing failure summary without a raw stack trace

#### Scenario: Backfilled tool result reaches UI
- **WHEN** the run loop backfills a failed tool result
- **THEN** renderers show a failed tool result line for the tool call id using a bounded summary

#### Scenario: Bash timeout reaches UI
- **WHEN** a bash command times out
- **THEN** renderers show a concise timeout summary and do not dump unbounded command output

#### Scenario: Abort reaches UI
- **WHEN** a turn is aborted
- **THEN** renderers flush pending output and show a boundary indicating the turn was cancelled or interrupted

#### Scenario: Hidden thinking exists near failure
- **WHEN** hidden thinking was emitted before a failure or abort
- **THEN** renderers continue to exclude hidden thinking from normal stdout and visible current-turn text
