# model-configuration Specification

## Purpose
TBD - created by archiving change stage-01-minimal-loop. Update Purpose after archive.
## Requirements
### Requirement: User-level model config

The system SHALL load model configuration from `~/.kai-code-agent/config.yaml` by default and validate `version`, `defaultModel`, and the referenced model profile before running a model-backed command.

#### Scenario: Valid default profile exists
- **WHEN** the config file contains `version: 1`, a `defaultModel`, and a matching profile with `preset`, `provider`, `baseURL`, `apiKey`, and `model`
- **THEN** the system uses that profile as the default model configuration

#### Scenario: Default profile is missing
- **WHEN** the config file is absent or `defaultModel` does not reference a complete model profile
- **THEN** the system treats model configuration as missing and starts first-run setup before running the task

### Requirement: First-run setup wizard

The system SHALL run a first-run setup wizard when no valid default model profile exists, collect the provider preset, API key, model name, and any required custom provider fields, then save a valid user-level config.

#### Scenario: Minimax Global preset is selected
- **WHEN** the user selects `Minimax Global` and enters an API key and model name
- **THEN** the saved default profile uses `preset: Minimax Global`, `provider: openai`, and `baseURL: https://api.minimax.io/v1`

#### Scenario: Other preset is selected
- **WHEN** the user selects `Other` and enters custom provider details
- **THEN** the saved default profile uses the entered baseURL, the entered provider value, and defaults the provider value to `openai` when no provider is entered

#### Scenario: Setup completes before task execution
- **WHEN** a user starts `kai` or `kai run "<task>"` without an existing valid config
- **THEN** the system completes first-run setup and continues with the requested command using the newly saved default profile

### Requirement: Secure config persistence

The system SHALL create the user config directory as needed, write config files outside the project repository, and set the config file permissions to `0600` on platforms that support POSIX file modes.

#### Scenario: Config is saved
- **WHEN** first-run setup saves a model profile
- **THEN** the config file exists at the configured user-level path and its file mode is owner-readable and owner-writable only where POSIX modes are supported

#### Scenario: Repository files are inspected
- **WHEN** config is saved through Stage 01 setup
- **THEN** no API key is written to the project root, fixtures, or tracked repository config files

### Requirement: Config display redacts secrets

The system SHALL provide a config display command that shows the selected default profile metadata without printing raw API keys.

#### Scenario: Config is shown
- **WHEN** the user runs `kai config show`
- **THEN** the output includes the default model id, preset, provider, baseURL, and model name, and the API key value is redacted

