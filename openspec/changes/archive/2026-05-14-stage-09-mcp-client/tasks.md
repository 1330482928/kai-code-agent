## 1. Dependency and Settings

- [x] 1.1 Add the MCP TypeScript SDK dependency and update the lockfile.
- [x] 1.2 Add a minimal runtime settings loader if one does not already exist, covering `~/.kai-code-agent/settings.json`, `.kai/settings.json`, and `.kai/settings.local.json`.
- [x] 1.3 Implement `src/mcp/config.ts` with `mcpServers` schema parsing, default `approval: "ask"`, `enabled: true`, validation errors, and secret-safe display helpers.
- [x] 1.4 Add tests for settings merge order, disabled servers, invalid server config, and secret redaction.

## 2. MCP Client Lifecycle

- [x] 2.1 Implement `src/mcp/client.ts` with a stdio MCP client manager that lazily connects, caches clients per process, lists tools, calls tools, and closes all clients.
- [x] 2.2 Normalize startup, initialization, list, call, and close failures into concise typed errors that can become `ToolResult` failures or CLI list errors.
- [x] 2.3 Add a deterministic fixture MCP server under `fixtures/mcp/` for echo, large output, error result, non-text result, and collision scenarios.
- [x] 2.4 Add client lifecycle tests for successful list, failed server startup, call forwarding, and `closeAll()`.

## 3. MCP Tool Adapter

- [x] 3.1 Implement `src/mcp/adapter.ts` to sanitize server/tool names and adapt MCP `tools/list` entries into namespaced `ToolDef`s like `mcp__fixture__echo`.
- [x] 3.2 Preserve MCP input JSON Schema as provider-facing `parameters` while validating executable input as a parsed JSON object.
- [x] 3.3 Detect sanitized name collisions and report structured adapter errors without overwriting tools.
- [x] 3.4 Implement MCP approval policy handling for `allow`, `ask`, and `reject`, using `HumanInteractionManager` for `ask`.
- [x] 3.5 Implement `src/mcp/result.ts` and `src/mcp/format.ts` to convert MCP text, error, exception, large, and non-text outputs into bounded Kai `ToolResult`s.
- [x] 3.6 Add adapter/result tests for namespacing, schema preservation, object-input validation, collision handling, approval allow/ask/reject, and result normalization.

## 4. Registry, Provider, and CLI Integration

- [x] 4.1 Extend profile registry composition to accept dynamic external tools while preserving existing built-in tool behavior.
- [x] 4.2 Expose MCP tools to the build profile by default and keep them out of the plan profile by default.
- [x] 4.3 Integrate MCP discovery into `kai run`, bare `kai`, chat, and resume startup so provider schemas include available MCP tools before the first model request.
- [x] 4.4 Ensure MCP tool calls go through the existing runner, middleware, runtime event, session transcript, and `formatToolResultForModel` paths.
- [x] 4.5 Add `kai mcp list` command parsing and output for configured servers, adapted tool names, approval policy, and per-server failures.
- [x] 4.6 Update exports in `src/index.ts` for any MCP types/helpers needed by tests or downstream callers.

## 5. UI, Transcript, and Failure Behavior

- [x] 5.1 Update shared tool-use summary behavior so MCP tools display concise `mcp server/tool` titles instead of raw JSON argument dumps.
- [x] 5.2 Verify plain and Ink renderers show bounded MCP tool-use/result projections and never raw MCP transport objects.
- [x] 5.3 Verify session persistence and replay store MCP tool calls/results as normal transcript parts without persisting live client/process state.
- [x] 5.4 Ensure MCP list/run failures are rendered as concise errors or failed `ToolResult`s and do not crash the run loop.

## 6. Tests and Fixtures

- [x] 6.1 Add `tests/stage-09.test.ts` covering `kai mcp list`, `mcp__fixture__echo`, rejected server policy, failed server startup, large result bounding, and plan-profile exclusion.
- [x] 6.2 Add fixture-provider scripts for a model calling `mcp__fixture__echo` and for MCP failure recovery.
- [x] 6.3 Add or update core tool tests proving dynamic external tools serialize provider schemas and execute through the normal runner.
- [x] 6.4 Add renderer/replay tests proving MCP thinking/debug/raw transport data is not displayed as ordinary assistant text.

## 7. Validation

- [x] 7.1 Run `bun test -- stage-09`.
- [x] 7.2 Run related core tool and renderer tests.
- [x] 7.3 Run `bun run check`.
- [x] 7.4 Manually verify `bun run kai mcp list` with the fixture MCP server.
- [x] 7.5 Manually verify `bun run kai run --provider fixture --script fixtures/provider/mcp-echo.json "call echo tool"` calls the MCP echo tool and prints only bounded visible output.
