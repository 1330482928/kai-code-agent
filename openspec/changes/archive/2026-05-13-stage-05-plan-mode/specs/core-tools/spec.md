## ADDED Requirements

### Requirement: Tool registry supports profile-specific tool sets
The system SHALL compose tool registries for build and plan profiles without changing the foundation tool protocol or existing built-in tool contracts.

#### Scenario: Build registry is created
- **WHEN** the build profile registry is requested
- **THEN** it includes normal coding tools and plan entry capability while preserving existing built-in tool behavior

#### Scenario: Plan registry is created
- **WHEN** the plan profile registry is requested
- **THEN** it includes only plan-safe tools and excludes general workspace mutation tools

#### Scenario: Provider schemas are profile scoped
- **WHEN** provider schemas are requested from a profile registry
- **THEN** only tools enabled for that profile are serialized

### Requirement: Plan tools return structured tool results
The system SHALL implement plan tools using the shared `ToolDef`, `ToolContext`, `ToolResult`, validation, and model-visible formatting path.

#### Scenario: plan_enter returns a result
- **WHEN** `plan_enter` executes successfully
- **THEN** it returns a successful `ToolResult` with JSON-safe metadata describing the target profile and plan file if available

#### Scenario: plan_write returns a result
- **WHEN** `plan_write` writes Markdown content to the active plan file
- **THEN** it returns a successful `ToolResult` with JSON-safe metadata containing the plan path and byte count

#### Scenario: plan_exit returns a result
- **WHEN** `plan_exit` completes an approval flow
- **THEN** it returns a `ToolResult` whose metadata identifies approval status, plan path, and next profile

#### Scenario: Plan tool input is invalid
- **WHEN** a plan tool receives invalid input
- **THEN** the existing tool runner returns a structured validation failure and no plan state is changed
