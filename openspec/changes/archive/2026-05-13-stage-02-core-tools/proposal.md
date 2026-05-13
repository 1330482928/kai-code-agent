## Why

Stage 01 can send one user task to an OpenAI-compatible model and stream assistant text, but it cannot act on the workspace. The updated Stage 02 scope establishes the foundation Tool protocol, a generic ReAct loop, and the first coding tools v0 so later stages can build streaming UI, sessions, permissions, and richer tool orchestration on a stable base.

## What Changes

- Add a foundation-level tool protocol in `src/foundation/tool.ts` for `ToolDef`, `ToolContext`, `ToolResult`, tool runtime events, and provider-facing schema metadata.
- Add coding tool modules under `src/coding/tools/` for registry, runner, `read_file`, `write_file`, `edit_file`, and `bash`.
- Add a generic ReAct loop in `src/agent/react-loop.ts`: provider emits tool calls, the agent executes tools, appends tool results, and calls the provider again until final assistant text is produced.
- Add `src/agent/tool-result-formatter.ts` so raw tool results are converted into bounded model-visible content before provider continuation.
- Separate provider raw tool calls from executable tool uses: Stage 02 runner only receives already parsed JSON object input, while partial streamed argument accumulation remains deferred to Stage 03.
- Extend the provider contract so adapters can expose tool schemas, emit complete tool calls, and receive tool result messages for continuation.
- Use Bun file/process primitives for Stage 02 tool execution: `Bun.file`, `Bun.write`, and `Bun.spawn`.
- Extend fixture replay so tests and demo commands can simulate model tool calls without network access.
- Keep `kai run`, fixture mode, config display, and the existing Ink task entry compatible with Stage 01 behavior.

## Scope

- `read_file` reads UTF-8 text files inside the current workspace and returns concise output.
- `write_file` writes UTF-8 text files inside the current workspace and returns a path/size summary.
- `edit_file` performs exact string replacement, requiring a unique match unless `replaceAll` is set.
- `bash` runs a foreground command with `command`, `timeout`, and optional `description`, returning stdout/stderr previews, exit status, interruption state, and output byte counts in metadata.
- Tool execution is serial and local to a single CLI run.
- ReAct continuation is generic enough to support any registered tool, but Stage 02 only ships the four built-in coding tools.
- Tool failures include a normalized `error.kind`, and every raw `ToolResult` is formatted through a per-tool model-visibility policy before it is sent back to the model.

## Non-goals

- No permission prompts, sandbox policy engine, or dangerous command approval flow.
- No background bash tasks, progress UI, persisted large output files, or session transcripts.
- No plugin/MCP/custom tool loading.
- No LSP diagnostics, formatter integration, or semantic patching.
- No full chat TUI changes beyond preserving the current Stage 01 Ink entry behavior.

## Capabilities

### New Capabilities

- `core-tools`: Foundation tool protocol, built-in coding tool definitions, registry, validation, execution, workspace path safety, raw/model-visible result formatting, and tool result contracts for `read_file`, `write_file`, `edit_file`, and `bash`.

### Modified Capabilities

- `llm-run-loop`: Generic ReAct loop behavior, tool-enabled provider requests, provider raw tool-call normalization, executable tool-use dispatch, fixture tool-call replay, formatted tool result continuation, and final assistant response handling.

## Impact

- Affected code: `src/foundation/tool.ts`, `src/foundation/message.ts`, `src/foundation/model.ts`, `src/coding/tools/*`, `src/community/openai-compatible/provider.ts`, `src/community/fixture/provider.ts`, `src/agent/react-loop.ts`, `src/agent/tool-result-formatter.ts`, existing agent/CLI integration, `src/index.ts`, tests, and fixtures.
- Existing placeholders: the current `src/tools/*` surface should either be migrated to the new foundation/coding layout or kept only as a compatibility re-export if needed.
- Public internal APIs: `ProviderInput`, `ProviderEvent`, `Message`, tool types, and run-loop options will gain tool-call and tool-result shapes.
- Runtime impact: Stage 02 tool implementations target Bun file/process APIs; package metadata, TypeScript types, and validation commands may need to be adjusted accordingly.
- Test surface: add unit coverage for registry, runner, individual tools, raw-to-executable tool-call normalization, tool-result formatting, fixture replay, and CLI smoke coverage for fixture ReAct loops.

## Risks

- Bun API adoption can conflict with the current Node/tsx/Vitest setup; implementation should make the runtime boundary explicit and keep CLI validation commands aligned with the roadmap.
- Provider tool-call streaming formats vary across OpenAI-compatible APIs, so Stage 02 should normalize only complete parseable tool calls and explicitly defer partial argument accumulation to Stage 03.
- File mutation tools can damage the workspace if path checks are weak; all file tools must resolve paths under the configured cwd.
- `bash` can hang or emit large output; Stage 02 must enforce a timeout, output previews, and model-visible formatting policies even before Stage 03 adds richer streaming UI.
- Existing `runOnce()` tests and command behavior may regress if text-only runs are not kept as the default path.
