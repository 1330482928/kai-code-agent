# secret-masking Specification

## Purpose
TBD - created by archiving change stage-01-ink-tui-secrets. Update Purpose after archive.
## Requirements
### Requirement: API key input is masked

The system SHALL prevent raw API key characters from being displayed during interactive setup and SHALL render the visible API key value as a mask such as `************`.

#### Scenario: API key is typed
- **WHEN** the user types an API key during Ink setup
- **THEN** the terminal display shows only masked characters and never shows the raw API key text

#### Scenario: API key is pasted
- **WHEN** the user pastes an API key during Ink setup
- **THEN** the terminal display still shows only masked characters and never shows the raw API key text

### Requirement: Config display uses fixed secret redaction

The system SHALL display stored API keys as a fixed redacted value in config summaries.

#### Scenario: Config is shown
- **WHEN** the user runs `kai config show`
- **THEN** the output includes `API key: ************` and does not include the stored API key value

### Requirement: Masking does not corrupt stored credentials

The system SHALL treat secret masking as terminal display behavior and MUST NOT save literal mask characters in place of the actual API key.

#### Scenario: Setup saves API key
- **WHEN** the user completes setup after entering a real API key
- **THEN** the saved config contains the real API key value needed by the provider adapter, not `************`

#### Scenario: Provider run follows setup
- **WHEN** setup completes and the user submits a task
- **THEN** the provider receives the real API key from config while terminal output remains redacted

### Requirement: Secret values are excluded from tests and fixtures

The system SHALL avoid storing real API keys in repository fixtures, snapshots, or test output.

#### Scenario: Tests run
- **WHEN** tests cover API key masking or redaction
- **THEN** they use fake API key values and assert that raw secret strings do not appear in captured output

