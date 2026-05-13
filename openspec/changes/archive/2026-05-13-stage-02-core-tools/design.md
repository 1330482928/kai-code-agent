## Context

Stage 01 provides a one-turn CLI path: load model config, create an OpenAI-compatible provider, send user text, stream assistant text, and finish. The current provider event contract only supports text, usage, and done events, and fixture replay only covers those events.

The updated Stage 02 roadmap is no longer just "add a few tools." It introduces three boundaries that should remain useful beyond this stage:

- `src/foundation/tool.ts`: foundation Tool protocol shared by tool definitions, providers, runners, and future UI/session layers.
- `src/agent/react-loop.ts`: generic ReAct loop that can execute any registered tool and continue provider calls.
- `src/agent/tool-result-formatter.ts`: model-visibility boundary between raw tool outputs and provider continuation content.
- `src/coding/tools/*`: the first coding tool pack, containing registry, runner, file tools, and the minimal BashTool.

The roadmap also shifts tool I/O primitives to Bun: `Bun.file`, `Bun.write`, and `Bun.spawn`. Current project metadata still runs TypeScript through Node-oriented scripts, so this change must make the runtime boundary explicit during implementation instead of hiding it inside generic helpers.

The latest Stage 01 plan also moves core message/provider concepts into `src/foundation/*` and community adapters into `src/community/*`, with provider output separating visible `text_delta` from hidden `thinking_delta`. Stage 02 should build on that shape: tool events are additional model events, not UI text, and thinking output must remain hidden from plain command rendering.

## Goals / Non-Goals

**Goals:**

- Move the tool contract into `src/foundation/tool.ts`.
- Add built-in `read_file`, `write_file`, `edit_file`, and `bash` coding tools under `src/coding/tools/`.
- Normalize tool definitions through a registry and zod-backed runner.
- Use Bun file/process primitives for read/write/bash execution.
- Expose tool schemas to OpenAI-compatible providers.
- Normalize complete provider raw tool calls into executable tool uses and execute them serially through a generic ReAct loop.
- Format raw tool results into bounded model-visible content before returning them to the provider.
- Continue provider calls until final assistant text.
- Extend fixture replay to cover staged provider responses and deterministic ReAct demos.
- Keep all file tools constrained to the configured cwd.
- Keep `kai run`, fixture mode, and current Ink task entry behavior compatible.

**Non-Goals:**

- Permission prompts, approval policy, sandbox configuration, or command risk classification.
- Background bash, incremental bash progress rendering, persisted command transcripts, or large output files.
- Session persistence, multi-turn chat history, or full conversation TUI.
- Dynamic plugin loading, MCP integration, or user-defined tools.
- Formatting, diagnostics, semantic edits, or LSP integration.

## Decisions

### Tool protocol lives in foundation

`ToolDef`, `ToolContext`, `ToolResult`, `ToolError`, `ToolRuntimeEvent`, `ProviderRawToolCall`, `ExecutableToolUse`, provider-facing tool schema metadata, result formatting policy, and JSON-safe metadata types will live in `src/foundation/tool.ts`. The existing `src/tools/types.ts` placeholder should not remain the primary source of truth; it can be removed or turned into a narrow re-export if keeping imports stable is useful during the transition.

Alternatives considered:

- Keep everything under `src/tools/*`: simpler short term, but mixes foundation protocol with one specific coding tool pack.
- Place types under `src/provider/*`: makes provider serialization convenient, but tool execution and future UI/session layers also need the contract.

Rationale: Stage 02 is now a foundation stage. A neutral protocol module prevents coding tools, provider adapters, and later session/UI layers from owning each other's types.

### Provider raw tool calls are separate from executable tool uses

Provider adapters may observe provider-specific raw tool call payloads. Stage 02 normalizes only complete, parseable tool calls into `ExecutableToolUse` objects with `id`, `name`, and parsed JSON object `input`. The runner never receives string buffers, JSON fragments, or provider-specific raw payloads.

Alternatives considered:

- Let runner parse argument strings: fewer types, but mixes provider protocol concerns with execution and makes partial JSON failures look like tool validation failures.
- Implement full streamed argument accumulation now: closer to OpenAI streaming behavior, but the roadmap explicitly assigns the parse gate and streamed accumulator to Stage 03.

Rationale: The ReAct loop needs a clean execution boundary now, while Stage 03 can own richer stream processing without changing runner semantics.

### Coding tools are a concrete tool pack

`src/coding/tools/registry.ts`, `runner.ts`, `read.ts`, `write.ts`, `edit.ts`, and `bash.ts` will implement the v0 coding tool pack. The registry exposes only enabled tools to providers, and the runner validates inputs, catches failures, and normalizes `ToolResult`.

Alternatives considered:

- One monolithic `tools.ts`: less file churn, but poor separation once each tool gains tests.
- A plugin-style loader: more flexible, but explicitly out of scope until a later stage.

Rationale: The foundation protocol stays reusable while coding tools remain simple and local.

### Tool definitions use zod as the internal authority

Each `ToolDef` will own a zod input schema, description, and execute function. The registry converts enabled tools to provider-facing JSON schema using the minimal schema metadata needed for Stage 02, while the runner uses zod for runtime validation before execution.

Alternatives considered:

- Hand-written JSON schema only: simpler provider payloads, but weaker TypeScript/runtime alignment.
- Full standard-schema abstraction like larger agents: more flexible, but unnecessary before plugins or MCP.

Rationale: OpenCode-style small tool definitions fit this project stage best, while zod keeps validation testable and already exists in dependencies.

### The loop becomes a generic ReAct loop

`src/agent/react-loop.ts` will own the tool-call continuation algorithm. It sends enabled tool schemas, streams provider events, records executable assistant tool calls, executes requested tools serially, formats tool results for the model, appends tool result messages, and repeats provider calls until no more tool calls are requested and final assistant text is available.

Alternatives considered:

- Add tool handling directly to the existing `runOnce()` implementation: fewer files, but keeps a misleading name and blurs the Stage 01 text-only loop with Stage 02 ReAct behavior.
- Build a full session executor now: closer to mature agents, but pulls Stage 04 persistence forward.

Rationale: A generic ReAct loop is the right Stage 02 boundary; it remains single-run and memory-only while being tool-pack agnostic.

### Raw tool results are formatted before model continuation

Tools return raw `ToolResult` values with `ok`, `output`, optional `metadata`, and optional structured `error`. The ReAct loop must call `formatToolResultForModel(toolName, rawResult)` before appending a tool result message. The formatter owns success/error normalization, `error.kind` visibility, output caps, per-tool summaries, and selected metadata exposure.

Initial policies:

| Tool | Model-visible content |
| --- | --- |
| `read_file` | Body within offset/limit; include continuation hint when truncated |
| `write_file` | Path, byte count, and short summary |
| `edit_file` | Path, replacement count, and diff summary |
| `bash` | Command, exit code, stdout/stderr previews, output bytes, optional persisted output path |
| unknown/error | Structured JSON with `ok:false`, `error.kind`, message, and bounded details |

Alternatives considered:

- Send raw `ToolResult.output` directly: simpler, but lets large bash/file/search output pollute model context.
- Put all formatting in each tool: local control, but inconsistent error shape and hard to reuse for future MCP/search tools.

Rationale: Stage 02 needs a single model-visibility gate before context management exists. This keeps raw execution details available for later transcript/debug uses while protecting the provider continuation.

### Tool execution is serial

The ReAct loop will execute tool calls one at a time in provider order. A provider event may include multiple complete tool calls, but Stage 02 does not execute them concurrently.

Alternatives considered:

- Concurrent read-only tools: useful later, but introduces cancellation, ordering, and output interleaving before the event layer exists.
- Provider-specific parallel tool support: too early for a minimal local agent.

Rationale: Serial execution is predictable, easier to fixture-test, and leaves concurrency policy for a later stage.

### Provider events carry complete tool calls

`ProviderEvent` will gain a complete `tool_call` event shape containing a stable id, tool name, and parsed JSON object input. Stage 02 adapters should only emit this event when a provider raw tool call is already complete and parseable. Streamed partial argument accumulation and parse gating are deferred to Stage 03.

Alternatives considered:

- Stream partial tool-call deltas through the agent loop: closer to raw OpenAI protocol, but pushes provider-specific assembly into the loop and UI.
- Accumulate OpenAI function argument deltas in Stage 02: useful, but the latest roadmap keeps half-argument parsing in Stage 03.
- Treat tool calls as assistant text: easier to parse in fixtures, but diverges from real provider APIs.

Rationale: The ReAct loop should consume provider-neutral executable tool uses. Stage 03 can add stream processors and argument accumulation without changing the runner or formatter contracts.

### Messages gain assistant tool calls and tool result messages

The internal `Message` type will add assistant messages that can carry `toolCalls`, plus tool messages with `toolCallId`, `name`, and serialized result content. OpenAI-compatible providers will serialize these to Chat Completions messages using assistant `tool_calls` and role `tool` messages.

Alternatives considered:

- Keep tool state outside messages: simpler type change, but hard to continue provider context correctly.
- Store raw provider messages: easier adapter implementation, but leaks provider details into the loop.

Rationale: Tool results need to be part of model context immediately, while session persistence remains out of scope.

### File and bash tools use Bun primitives

`read_file` should use `Bun.file`, `write_file` should use `Bun.write`, and `bash` should use `Bun.spawn`. Path resolution and cwd containment still use normal path semantics, but file/process I/O should follow the Stage 02 roadmap rather than Node `fs/promises` and `child_process.spawn`.

Alternatives considered:

- Keep Node built-ins for easier compatibility with current scripts: less runtime churn, but no longer matches the updated roadmap.
- Wrap Bun and Node behind an adapter: safer for mixed runtime support, but adds abstraction before the project has a real compatibility requirement.

Rationale: The roadmap has chosen Bun for Stage 02 tool execution. The implementation should surface any runtime/type changes early and keep validation commands honest.

### File tools resolve paths under cwd

All file tools will resolve user paths against `ToolContext.cwd`, reject paths outside cwd, and reject non-file targets when a file is required. `read_file`, `write_file`, and `edit_file` operate on UTF-8 text only.

Alternatives considered:

- Allow absolute paths: convenient, but unsafe before permissions.
- Add approval prompts now: too large for Stage 02 and planned for later policy stages.

Rationale: cwd containment is the minimum safety boundary for a local agent that can mutate files.

### Bash is a foreground command with capped output

The `bash` tool accepts `command`, optional `timeout`, and optional `description`. It runs as a foreground command through `Bun.spawn`, enforces a default timeout, captures stdout/stderr previews, exit code, interruption state, and total output bytes in `metadata.bash`. It does not emit progress in Stage 02, though `ToolContext.emit` remains available for Stage 03.

Alternatives considered:

- Implement Claude-like background tasks immediately: more product-like, but pulls in lifecycle and UI complexity.
- Ban shell execution until permissions exist: safer, but Stage 02 would not validate the most important ReAct path.

Rationale: A foreground timeout-limited BashTool gives a useful end-to-end loop and aligns the naming/shape with the long-term Claude-like target.

### Fixture provider supports staged provider calls

Fixture scripts will support a sequence of provider responses. Each `provider.stream()` invocation consumes the next response, so tests can model: assistant asks for a tool, tool runs, provider receives the tool result, assistant returns final text.

Alternatives considered:

- One flat event array for all calls: simple, but cannot assert continuation boundaries.
- Custom mock providers in every test: flexible, but less useful for CLI demos.

Rationale: Staged fixture scripts keep CLI smoke tests deterministic and make provider continuation visible.

## Risks / Trade-offs

- Bun runtime adoption can conflict with current Node-oriented scripts and typings → Update package/test metadata deliberately, add Bun types if needed, and validate with the roadmap's `bun run` / `bun test` commands.
- Provider tool-call formats vary across OpenAI-compatible APIs → Normalize only complete parseable tool calls in Stage 02, cover malformed complete calls with provider errors, and leave partial streamed accumulation to Stage 03.
- File tools can mutate the workspace unexpectedly → Enforce cwd containment before every read/write/edit and keep write/edit tests in temporary directories.
- `bash` can hang or produce large output → Apply a default timeout, kill on timeout, and cap stored previews.
- Tool result content can become too verbose → Keep raw results structured and always pass through `formatToolResultForModel` before provider continuation.
- Text-only Stage 01 behavior can regress → Preserve existing behavior for providers that never emit tool calls and keep fixture smoke tests.

## Migration Plan

1. Move the authoritative tool protocol into `src/foundation/tool.ts`.
2. Create the `src/coding/tools/` package and migrate any existing `src/tools/*` exports to the new boundary.
3. Add `src/agent/tool-result-formatter.ts` and initial per-tool formatting policies.
4. Add or adjust Bun typings/package metadata needed for `Bun.file`, `Bun.write`, `Bun.spawn`, and `bun test`.
5. Update provider adapters and fixtures to support tool schemas and complete executable tool-call events.
6. Add `src/agent/react-loop.ts` and wire CLI task execution to it while preserving text-only runs.
7. Add focused tests and fixture demo files before using real provider calls.

Rollback is straightforward while this change is unarchived: restore the Stage 01 provider/loop types, remove the foundation/coding tool modules, and keep the existing CLI path. No user-level config migration or persistent data migration is required.

## Open Questions

- Which exact MiniMax/OpenAI-compatible models support tool calling reliably enough for manual validation?
- Should Stage 02 expose tools to every configured OpenAI-compatible model by default, or add a config flag later if a provider rejects tool schemas?
- What preview byte limits should be used for `read_file` and `bash` before Stage 03 introduces richer output handling?
- Should `src/tools/*` remain as compatibility re-exports after the migration, or be removed to avoid two tool namespaces?
- How much raw tool metadata should be retained in memory during Stage 02 before Stage 04 introduces persistent transcripts?
