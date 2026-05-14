## ADDED Requirements

### Requirement: Profiles expose Stage 07 search and patch tools safely
The system SHALL expose Stage 07 search tools according to profile read/write boundaries and SHALL expose `apply_patch` only to profiles that may mutate workspace files.

#### Scenario: Build profile exposes search and patch tools
- **WHEN** provider schemas are requested for the build profile
- **THEN** the schemas include `grep`, `glob`, and `apply_patch` along with the existing build-profile tools

#### Scenario: Plan profile exposes search tools
- **WHEN** provider schemas are requested for the plan profile
- **THEN** the schemas include `grep` and `glob` because they are read-only planning tools

#### Scenario: Plan profile excludes apply_patch
- **WHEN** provider schemas are requested for the plan profile
- **THEN** the schemas do not include `apply_patch`

#### Scenario: Profile tool names are inspectable
- **WHEN** tests inspect profile tool names for build and plan
- **THEN** they can deterministically assert the Stage 07 tool inclusion and exclusion rules
