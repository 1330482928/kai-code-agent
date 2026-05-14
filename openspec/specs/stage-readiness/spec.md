# stage-readiness Specification

## Purpose
TBD - created by archiving change stage-15-readiness-stabilization. Update Purpose after archive.
## Requirements
### Requirement: Stage readiness validation is repeatable
The system SHALL define a repeatable readiness gate before continuing to a new roadmap stage.

#### Scenario: Readiness checks are run
- **WHEN** a stabilization pass is applied before the next roadmap stage
- **THEN** the pass records results for TypeScript validation, focused Bun tests, OpenSpec validation, and repository status review

#### Scenario: Validation failure is present
- **WHEN** a readiness command still fails after the stabilization pass
- **THEN** the failure is documented with the command, runtime, scope, and whether it blocks the next stage

### Requirement: Active OpenSpec changes are reconciled
The system SHALL reconcile stale, duplicated, or empty active OpenSpec changes before recommending the next stage.

#### Scenario: Archived equivalent exists
- **WHEN** an active change is an empty or stale shell and an archived equivalent exists
- **THEN** the readiness pass records that equivalence and removes, archives, or otherwise closes the stale active shell

#### Scenario: Duplicate change is ambiguous
- **WHEN** an active change appears duplicated by archived work but may still contain future intent
- **THEN** the readiness pass keeps or closes it only after documenting the superseded-or-follow-up decision

#### Scenario: Next stage remains active
- **WHEN** `stage-15-context-quality` is the intended next substantive change
- **THEN** the readiness pass keeps it active and does not archive it as part of stabilization

### Requirement: Runtime-specific test boundaries are explicit
The system SHALL distinguish Bun-required tests from Node/Vitest-compatible tests in readiness validation.

#### Scenario: Bun API is required
- **WHEN** a test depends on Bun-only APIs such as `bun:sqlite`
- **THEN** the readiness pass runs or validates that behavior under Bun and does not treat Node module-resolution failure as the product runtime result

#### Scenario: Node-compatible test is available
- **WHEN** a test covers pure TypeScript or runtime-agnostic behavior
- **THEN** the readiness pass includes it in the Node/Vitest-compatible validation set or documents why it is excluded

### Requirement: Readiness outcome names the next action
The system SHALL produce a concise readiness outcome that identifies whether the repository can proceed and which OpenSpec change should be applied next.

#### Scenario: Repository is ready
- **WHEN** blocking validation is green or documented as non-blocking runtime scope
- **THEN** the readiness outcome names the next recommended change and the commands used to verify the baseline

#### Scenario: Repository is not ready
- **WHEN** blocking validation remains unresolved
- **THEN** the readiness outcome lists the blocking failures and does not recommend starting new feature work

