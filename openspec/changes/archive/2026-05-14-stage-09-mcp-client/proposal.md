## Why

Kai already has a stable internal tool protocol, profile-aware registries, failure normalization, and bounded tool-result formatting. Stage 09 uses that foundation to connect local MCP servers as external tool providers without weakening approval, validation, or renderer safety guarantees.

## What Changes

### Motivation

- Let Kai discover tools from local MCP stdio servers and expose them to the model through the same `ToolDef` and `ToolResult` path as built-in tools.
- Keep external tool execution bounded by the existing approval, failure handling, and model-visible formatting rules before expanding into richer MCP features later.

### Scope

- Add a Stage 09 MCP client layer for local stdio MCP servers.
- Load MCP server configuration from user/project runtime settings, with project-local secret overrides kept out of tracked project config.
- Lazily connect to configured servers, call MCP `tools/list`, and adapt each MCP tool into a namespaced Kai tool named `mcp__<server>__<tool>`.
- Forward approved tool calls to MCP `tools/call`, normalize MCP responses into Kai `ToolResult`, and format them through the existing bounded model-output path.
- Add a CLI surface for listing configured MCP tools, suitable for manual verification and demos.

### Non-goals

- No MCP resources, prompts, sampling, roots, remote transports, OAuth/login flows, or long-running background MCP sessions.
- No renderer-specific filtering of MCP results; safety must live in the MCP adapter, approval, result normalization, and formatter layers.
- No broad marketplace/plugin UX for MCP server installation.

### Risks

- External MCP tools can be unsafe or slow, so Stage 09 must default to explicit policy and return structured failures instead of crashing the run loop.
- MCP result content can be large or non-textual, so normalization and model-visible formatting must stay bounded.
- Dynamic tool names can collide or become invalid provider schema names, so server/tool names must be sanitized and namespaced deterministically.

## Capabilities

### New Capabilities

- `mcp-client`: Covers local stdio MCP server configuration, client lifecycle, MCP tool discovery, namespaced tool adaptation, approval policy, MCP tool execution, result normalization, bounded model formatting, and `kai mcp list`.

### Modified Capabilities

- `core-tools`: Tool registry composition and provider-schema serialization must support dynamic MCP-backed `ToolDef`s alongside built-in tools while preserving existing validation, execution, and result-formatting contracts.

## Impact

- Adds MCP modules under `src/mcp/` for config loading, stdio client lifecycle, tool adaptation, result normalization, formatter integration, and approval policy.
- Extends CLI command handling with `kai mcp list`.
- Extends tool registry composition so profile registries can include configured MCP tools.
- Adds or updates fixtures and tests for MCP listing, approved calls, rejected calls, server failures, namespacing, and bounded result formatting.
- Adds the MCP TypeScript SDK dependency if it is not already present.
