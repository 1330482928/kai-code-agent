## ADDED Requirements

### Requirement: Context quality debug surfaces remain type-stable
The system SHALL keep context-quality trace, replay, metrics, diff, and CLI debug surfaces compatible with the existing context kernel debug snapshot types.

#### Scenario: Context quality modules are imported
- **WHEN** the CLI or tests import context-quality trace, replay, metrics, diff, or fixture helpers
- **THEN** the exported symbols resolve successfully and TypeScript validation completes without missing import or missing export errors

#### Scenario: Debug snapshot is converted for quality tooling
- **WHEN** context-quality tooling converts a prompt debug snapshot or trace into comparison, replay, or metrics data
- **THEN** it uses fields that exist on the context kernel debug types or performs explicit normalization before accessing optional quality-only fields

#### Scenario: Stage 15 feature work has not started
- **WHEN** the readiness pass fixes context-quality compile failures
- **THEN** it does not add new context selection, ranking, compression, or prompt-evaluation semantics beyond what is required to preserve existing behavior
