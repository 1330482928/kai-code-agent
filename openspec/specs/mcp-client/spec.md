# mcp-client Specification

## Purpose
TBD - created by archiving change stage-09-mcp-client. Update Purpose after archive.
## Requirements
### Requirement: MCP server settings are loaded safely

The system SHALL load MCP server definitions from runtime settings layers without storing model API keys in project-root configuration.

#### Scenario: User and project MCP settings are loaded
- **WHEN** user settings and project settings define enabled `mcpServers`
- **THEN** the MCP config loader returns the merged server definitions using the existing settings merge rules

#### Scenario: Local project MCP settings override shared project settings
- **WHEN** `.kai/settings.local.json` defines an MCP server field that also exists in `.kai/settings.json`
- **THEN** the local setting takes precedence for scalar/object fields and remains machine-local

#### Scenario: Invalid MCP server config is rejected
- **WHEN** an MCP server definition is missing a command or has an invalid approval policy
- **THEN** the loader returns a structured configuration error that identifies the server name without printing secret values

#### Scenario: Disabled MCP server is ignored
- **WHEN** an MCP server definition sets `enabled` to false
- **THEN** the server is not connected, listed, exposed to providers, or callable

### Requirement: MCP stdio client lifecycle is managed

The system SHALL manage local stdio MCP clients lazily and close them when the CLI process no longer needs them.

#### Scenario: MCP server connects during tool listing
- **WHEN** `kai mcp list` requests tools for an enabled server
- **THEN** the MCP client manager starts the configured stdio command and calls MCP `tools/list`

#### Scenario: MCP server connects during model run
- **WHEN** a model run needs provider schemas for configured MCP tools
- **THEN** the MCP client manager lazily connects to the server before adapting tools

#### Scenario: MCP connection fails
- **WHEN** a configured MCP server cannot start or fails initialization
- **THEN** the system reports a concise structured failure for that server instead of crashing the CLI

#### Scenario: MCP clients close after use
- **WHEN** a CLI command that opened MCP clients finishes or fails
- **THEN** all opened MCP clients are closed in a cleanup path

### Requirement: MCP tools are adapted into namespaced Kai tools

The system SHALL adapt MCP `tools/list` results into Kai `ToolDef`s with deterministic namespaced tool names and provider-safe schemas.

#### Scenario: MCP tool is namespaced
- **WHEN** server `fixture` exposes MCP tool `echo`
- **THEN** Kai exposes the adapted tool as `mcp__fixture__echo`

#### Scenario: MCP input schema is preserved for providers
- **WHEN** an MCP tool provides an input JSON Schema
- **THEN** the adapted `ToolDef` uses that schema as its provider-facing `parameters`

#### Scenario: MCP tool input must be a parsed object
- **WHEN** a model-requested MCP tool call reaches the runner
- **THEN** the adapted tool accepts only parsed JSON object input before forwarding the call to the MCP server

#### Scenario: MCP tool name collision is detected
- **WHEN** two MCP tools from the same server sanitize to the same Kai tool name
- **THEN** the adapter reports a structured collision error and does not silently overwrite either tool

### Requirement: MCP execution follows approval policy

The system SHALL apply MCP server approval policy before executing an MCP `tools/call` request.

#### Scenario: Allowed MCP tool executes
- **WHEN** an MCP server has `approval` set to `allow` and the model calls one of its tools
- **THEN** Kai forwards the call to MCP `tools/call` without prompting

#### Scenario: Rejected MCP tool does not execute
- **WHEN** an MCP server has `approval` set to `reject` and the model calls one of its tools
- **THEN** Kai returns a failed `ToolResult` with `error.kind` of `permission` without calling the MCP server

#### Scenario: Ask policy requests human approval
- **WHEN** an MCP server has `approval` set to `ask` and the model calls one of its tools
- **THEN** Kai requests approval through `HumanInteractionManager` before calling the MCP server

#### Scenario: User denies MCP approval
- **WHEN** the user denies an MCP approval request
- **THEN** Kai returns a failed `ToolResult` with `error.kind` of `permission` without calling the MCP server

### Requirement: MCP tool calls are normalized into Kai tool results

The system SHALL convert MCP `tools/call` success, error, and exception outcomes into Kai `ToolResult` values before model continuation or rendering.

#### Scenario: MCP text result succeeds
- **WHEN** an MCP tool returns text content successfully
- **THEN** Kai returns a successful `ToolResult` containing bounded text output and MCP metadata

#### Scenario: MCP error result fails
- **WHEN** an MCP tool response indicates `isError`
- **THEN** Kai returns a failed `ToolResult` with a concise execution error message

#### Scenario: MCP SDK exception fails
- **WHEN** an MCP tool call throws an SDK or transport exception
- **THEN** Kai returns a failed `ToolResult` instead of crashing the agent loop

#### Scenario: MCP non-text result is summarized
- **WHEN** an MCP tool returns non-text content
- **THEN** Kai summarizes the content type in output and stores JSON-safe details in metadata without embedding raw binary data

### Requirement: MCP result formatting is bounded

The system SHALL pass normalized MCP `ToolResult`s through the existing model-visible formatter before appending them to provider continuation messages.

#### Scenario: Large MCP text result is bounded
- **WHEN** an MCP tool returns text larger than the model-visible limit
- **THEN** the formatted model content is truncated or summarized according to the tool format policy

#### Scenario: MCP failure is model-visible as structured failure
- **WHEN** an MCP tool returns a failed `ToolResult`
- **THEN** the model-visible content includes `ok:false`, `error.kind`, and a concise message

#### Scenario: Raw MCP transport data is not projected
- **WHEN** MCP results are shown in plain output, Ink output, replay, or transcript projection
- **THEN** the default projection uses bounded Kai tool-result content rather than raw MCP transport objects

### Requirement: MCP tools are exposed to model runs

The system SHALL include configured MCP tools in build-profile model runs through the existing provider tool schema path.

#### Scenario: Build profile includes MCP tools
- **WHEN** a build-profile run starts with an enabled MCP server exposing `echo`
- **THEN** the provider schema list includes `mcp__fixture__echo` alongside enabled built-in build tools

#### Scenario: Plan profile excludes MCP tools by default
- **WHEN** a plan-profile run starts with enabled MCP servers
- **THEN** MCP tools are not exposed unless a future profile policy explicitly enables them

#### Scenario: MCP tool execution uses normal runner path
- **WHEN** the model calls an exposed MCP tool
- **THEN** the existing tool runner, middleware, runtime events, and formatter path handle the call

### Requirement: MCP list command inspects configured tools

The system SHALL provide a `kai mcp list` command that lists configured MCP servers and their adapted tools.

#### Scenario: MCP list prints tools
- **WHEN** the user runs `kai mcp list` with an enabled fixture server exposing `echo`
- **THEN** stdout includes the server name and the adapted tool name `mcp__fixture__echo`

#### Scenario: MCP list reports server failure
- **WHEN** one configured MCP server fails to start during `kai mcp list`
- **THEN** the command prints a concise failure for that server and continues reporting other servers when possible

#### Scenario: MCP list hides secrets
- **WHEN** `kai mcp list` prints server configuration or failure details
- **THEN** it does not print configured secret values from environment or settings

