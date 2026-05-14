## Context

Kai currently has a shared `ToolDef`/`ToolResult` protocol, profile-aware tool registries, middleware-based approval, structured tool failures, bounded model-visible result formatting, and transcript-first session persistence. Stage 09 should treat MCP servers as another source of tools, not as a parallel execution system.

The Stage 09 roadmap is intentionally narrow: local stdio MCP servers, `tools/list`, and `tools/call`. It should not introduce resources, prompts, remote transports, long-running UI sessions, or a new approval architecture. This keeps the work closer to Codex and Claude Code style local tool adapters, while avoiding OpenCode-style plugin breadth until the core path is stable.

## Goals / Non-Goals

**Goals:**

- Load local MCP server definitions from runtime settings.
- Connect to MCP stdio servers lazily and list their tools.
- Adapt MCP tools into Kai `ToolDef`s with deterministic namespaced names.
- Execute MCP tool calls through the existing tool runner, middleware, HITL approval, and formatter path.
- Normalize MCP success, error, large, and non-text results into bounded Kai `ToolResult`s.
- Add `kai mcp list` for local inspection and manual demos.
- Cover provider API, config, permissions, middleware, UI display, session persistence, and test behavior.

**Non-Goals:**

- MCP resources, prompts, roots, sampling, elicitation, remote transports, OAuth/login, or marketplace installation.
- A new renderer path for MCP output.
- A full JSON Schema validator or schema-to-Zod compiler.
- Persisting MCP process state or long-running server sessions across Kai CLI processes.

## Decisions

### 1. Use only stdio MCP transport in Stage 09

Kai will use the MCP TypeScript SDK stdio transport for configured local commands. The client manager will expose `listTools(serverName)` and `callTool(serverName, toolName, input)` and hide SDK-specific transport details from the rest of the app.

Alternative considered: support HTTP/SSE or all MCP features immediately. That would increase auth, lifecycle, and UI complexity before the internal tool adapter is proven. Stdio-only matches the roadmap acceptance path and keeps failure handling local and testable.

### 2. Read MCP server definitions from runtime settings layers

MCP configuration will live under a `mcpServers` object in runtime settings, not in the model-secret config:

```json
{
  "mcpServers": {
    "fixture": {
      "command": "bun",
      "args": ["fixtures/mcp/echo-server.ts"],
      "env": {},
      "approval": "ask",
      "enabled": true
    }
  }
}
```

The loader should follow the settings rule: user settings at `~/.kai-code-agent/settings.json`, project settings at `.kai/settings.json`, and local project overrides at `.kai/settings.local.json`. `.kai/settings.local.json` is for machine-local values and MUST be gitignored by default when Kai creates it. Model API keys remain in `~/.kai-code-agent/config.yaml`.

Alternative considered: add MCP blocks to the existing YAML model config. That would mix runtime tool configuration with model credentials and conflict with the settings split already planned for approvals and runtime preferences.

### 3. Lazily connect and close clients per CLI process

`McpClientManager` will connect only when `kai mcp list` needs tool metadata or when a model run first asks for MCP-backed tools. It will cache clients for the current process and expose `closeAll()` for CLI `finally` blocks.

Alternative considered: connect all MCP servers during CLI startup. That makes every chat/run sensitive to broken optional servers and increases startup latency. Lazy connection preserves Stage 08 recovery behavior by converting connection failures into structured tool or listing errors.

### 4. Namespace and sanitize MCP tool names

Each adapted tool name will be `mcp__<server>__<tool>`, where server and tool segments are lowercased/sanitized to provider-safe characters. If two raw tools sanitize to the same name, the adapter MUST keep one deterministic name and report the collision as a structured configuration/listing error instead of overwriting silently.

Alternative considered: expose raw MCP names directly. That risks collisions with built-ins such as `read_file`, provider schema rejection, and unclear approval prompts.

### 5. Preserve MCP JSON Schema for providers without compiling it to Zod

The adapted `ToolDef.parameters` will preserve the MCP input schema as the provider-facing JSON Schema. The executable `inputSchema` will validate that the runner receives a parsed JSON object, while the MCP server remains responsible for its detailed schema validation.

Alternative considered: compile arbitrary JSON Schema into Zod. That adds dependency and semantic drift risk. Stage 09 only needs to prevent malformed non-object tool calls before forwarding them.

### 6. Gate MCP execution through explicit approval policy

Each server can set `approval` to `allow`, `ask`, or `reject`; missing policy defaults to `ask`. `reject` returns a failed `ToolResult` without calling the MCP server. `ask` routes through `HumanInteractionManager`, using the same queue as existing approval, plan approval, and future MCP elicitation. `allow` executes without prompting but still goes through the tool runner and formatter.

Alternative considered: classify MCP tools as mutating or read-only from descriptions. That is unreliable. The explicit server-level policy is simple and auditable for Stage 09.

### 7. Normalize MCP results before model continuation

MCP `tools/call` responses will be converted into Kai `ToolResult` values before they reach the model or renderers. Text content is concatenated and bounded; non-text content is summarized with metadata; MCP `isError` or SDK exceptions become failed `ToolResult`s. The model continuation receives only `formatToolResultForModel(result, tool)` output.

Alternative considered: pass raw MCP content arrays into transcript/model messages. That would bypass Stage 08 failure normalization and large-output controls.

### 8. Compose dynamic MCP tools into profile registries conservatively

Stage 09 will compose configured MCP tools into the build profile registry. Plan mode will not include MCP tools by default because Kai cannot infer whether an arbitrary MCP tool mutates external state. A later stage can add read-only classification or per-tool profile settings if needed.

Provider API impact: provider tool schemas are generated after MCP tools are adapted, so the model sees dynamic MCP tools the same way it sees built-ins. Tool-call streaming rules do not change: partial arguments are never executable, and only parsed JSON object input reaches the runner.

### 9. Keep UI and persistence as projections of normal tool events

Plain and Ink renderers will display MCP tool use through the shared `summarizeToolUse` path and must not render raw argument JSON as the primary title. Session persistence stores MCP tool uses/results as normal transcript parts; it does not store live MCP process handles. Replay and transcript projection show bounded formatted output, not raw server transport data.

`kai mcp list` is a plain CLI inspection command. It should print configured servers, discovered namespaced tool names, and concise failure lines for servers that cannot start or list tools.

## Risks / Trade-offs

- [Risk] A configured MCP command hangs or fails during startup -> Mitigation: lazy connect, abort signals, timeout-aware calls where the SDK allows it, and structured `execution` failures.
- [Risk] MCP output is huge or binary-like -> Mitigation: normalize content into bounded text summaries and metadata, then apply existing `formatToolResultForModel` limits.
- [Risk] Approval prompts become noisy -> Mitigation: default `ask`, allow explicit per-server `allow` for trusted local fixtures, and keep remembered approval persistence for a later settings-focused refinement.
- [Risk] Dynamic tool names break provider schema constraints -> Mitigation: deterministic sanitization, namespacing, and collision reporting before provider schema serialization.
- [Risk] Plan mode accidentally gains mutating external tools -> Mitigation: Stage 09 keeps MCP tools build-only by default.

## Migration Plan

1. Add the MCP SDK dependency and new `src/mcp/` modules behind optional config.
2. Add runtime settings loading for `mcpServers` if no shared settings loader exists yet.
3. Integrate MCP tool discovery into profile registry creation without changing built-in tool names or behavior.
4. Add `kai mcp list` and deterministic fixture MCP server tests.
5. Validate with `bun test -- stage-09`, related core tool tests, and `bun run check`.

Rollback is straightforward because MCP is opt-in: remove `mcpServers` settings or disable the integration path, and built-in tools continue to work.

## Open Questions

- Should a later stage support per-tool profile exposure and read-only classification for plan mode?
- Should secrets in MCP `env` support explicit environment-variable interpolation syntax rather than direct values?
- Should remote transports and MCP resources/prompts be Stage 10+ work or separate changes after memory/manual context features?
