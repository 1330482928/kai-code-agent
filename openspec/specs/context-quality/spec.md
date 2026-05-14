# context-quality Specification

## Purpose
TBD - created by archiving change stage-15-context-quality. Update Purpose after archive.
## Requirements
### Requirement: Context traces are exportable

The system SHALL export trace data for real sessions that captures context assembly and outcome information needed for quality analysis.

#### Scenario: Trace export includes model input digest
- **WHEN** a session trace is exported
- **THEN** the export includes ContextItems, budget decisions, cut reasons, and a model input digest

#### Scenario: Trace export is deterministic
- **WHEN** the same session is exported twice without changes
- **THEN** the exported trace structure remains stable aside from expected timestamps or identifiers

### Requirement: Trace export is redacted

The system SHALL redact secrets and sensitive local paths from trace exports by default.

#### Scenario: Secrets are removed
- **WHEN** a trace contains tokens, private keys, cookies, or `.env` values
- **THEN** the export replaces those values with redacted placeholders

#### Scenario: Sensitive paths are bounded
- **WHEN** a trace contains local paths that should not be shared verbatim
- **THEN** the export bounds or redacts them instead of writing the raw path

### Requirement: Eval fixtures describe quality expectations

The system SHALL support eval fixtures that describe critical facts, forbidden facts, and expected inclusion or exclusion behavior for context items.

#### Scenario: Critical facts are declared
- **WHEN** a fixture describes a long or noisy task
- **THEN** the fixture can list critical facts that must remain present in the assembled context

#### Scenario: Forbidden facts are declared
- **WHEN** a fixture describes stale or conflicting inputs
- **THEN** the fixture can list forbidden facts that must not be promoted in the assembled context

### Requirement: Replay uses the context builder path

The system SHALL replay context assembly through the same Stage 06 builder path used in normal runs.

#### Scenario: Replay is deterministic
- **WHEN** a fixture is replayed against the same code and inputs
- **THEN** the replay produces the same context item ordering and budget cuts

#### Scenario: Replay stays read-only
- **WHEN** a fixture is replayed
- **THEN** the replay does not mutate sessions or write new agent behavior

### Requirement: Context quality metrics are reported

The system SHALL compute bounded diagnostic metrics for context quality.

#### Scenario: Metrics cover retention and churn
- **WHEN** a trace or fixture is analyzed
- **THEN** the report includes retained critical facts, stale/conflicting item counts, token ratios, compression, and cache-stable section churn

#### Scenario: Metrics stay descriptive
- **WHEN** metrics are computed
- **THEN** they describe quality and do not change runtime behavior on their own

### Requirement: Prompt debug diffing is available

The system SHALL compare prompt debug snapshots to show meaningful changes in item order, cut reasons, and token use.

#### Scenario: Two debug snapshots are compared
- **WHEN** the user compares two prompt debug snapshots
- **THEN** the diff reports item order changes, cut reason changes, and token deltas in a bounded form

### Requirement: Tuning rules are explicit

The system SHALL represent context quality adjustments as named tuning rules with clear rollback semantics.

#### Scenario: A tuning rule is documented
- **WHEN** a ranking, budget, dedupe, or compaction change is proposed
- **THEN** the proposal names the rule, describes the expected effect, and identifies how to roll it back

