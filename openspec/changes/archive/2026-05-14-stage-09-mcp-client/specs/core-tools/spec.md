## ADDED Requirements

### Requirement: Tool registries support dynamic external tools

The system SHALL compose dynamic external `ToolDef`s with built-in tools without changing the foundation tool protocol, provider schema shape, runner validation path, or model-visible result formatting path.

#### Scenario: Dynamic tool is registered with built-in tools
- **WHEN** a profile registry is created with built-in tools and dynamic MCP-backed tools
- **THEN** the registry lists both sets using the shared `ToolDef` interface

#### Scenario: Dynamic tool provider schema is serialized
- **WHEN** provider schemas are requested from a registry that contains a dynamic MCP-backed tool
- **THEN** the schema includes the dynamic tool name, description, and JSON Schema parameters without exposing executable functions

#### Scenario: Dynamic tool is executed by the normal runner
- **WHEN** the model calls a registered dynamic MCP-backed tool with parsed JSON object input
- **THEN** the existing runner executes the tool handler and returns its `ToolResult`

#### Scenario: Dynamic tool result is formatted normally
- **WHEN** a dynamic MCP-backed tool returns a raw `ToolResult`
- **THEN** `formatToolResultForModel` applies the tool's format policy and bounded output limits before model continuation

#### Scenario: Dynamic tool profile filtering is conservative
- **WHEN** profile-specific registries are composed for build and plan profiles
- **THEN** dynamic MCP-backed tools are included only in profiles whose policy explicitly allows them
