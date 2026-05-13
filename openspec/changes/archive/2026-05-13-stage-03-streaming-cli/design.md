## Context

Stage 02 established a foundation tool protocol, core coding tools, formatted tool results, and a generic ReAct loop. That loop can execute complete tool calls, but the next set of concerns would make the loop brittle if added directly: approval, structured user questions, partial streamed tool arguments, thinking filtering, bash progress, tool lifecycle display, current-turn Ink rendering, and future plan/permission/skills/memory hooks.

Stage 03 therefore introduces the first extensibility layer around the loop. Middleware owns interception points; stream processors own argument assembly and thinking/text splitting; HumanInteractionManager owns prompt queues; `UiEvent` owns live process output; plain and Ink renderers become projections. This stage still does not create the durable transcript/session authority. Stage 04 will persist message/part/tool facts and build the session-backed chat shell.

## Goals / Non-Goals

**Goals:**

- Add an ordered middleware pipeline around agent, model, and tool execution.
- Allow `beforeToolUse` middleware to return a `ToolResult` and skip real tool execution.
- Accumulate streamed tool argument deltas and only emit executable tool uses after JSON parse succeeds.
- Treat malformed final tool arguments as structured parse failures.
- Split provider thinking/reasoning and `<think>...</think>` content away from normal text.
- Add `UiEvent` and shared tool summaries for live current-turn output.
- Update plain rendering and add an Ink current-turn renderer consuming the same events.
- Add HumanInteractionManager, approval prompt flow, `ask_user_question` tool, and minimal approval middleware.
- Connect `ToolContext.emit` to `bash_progress` events.
- Add render batching and Ctrl-C abort handling.

**Non-Goals:**

- No durable session store or transcript persistence.
- No full chat/history TUI.
- No complete permission policy, remembered approval settings, plan mode, skills, memory, MCP elicitation, OAuth/login, or slash-command system.
- No background bash task tracking.

## Decisions

### Middleware is the loop extension boundary

`src/agent/middleware.ts` will define hooks for `beforeAgentRun`, `afterAgentRun`, `beforeModel`, `afterModel`, `beforeToolUse`, and `afterToolUse`. Hooks run in registration order. `beforeToolUse` may return a `ToolResult`; when it does, the real tool runner is skipped and the returned result follows the same formatting/continuation path as a real tool result.

Alternatives considered:

- Add approval and prompts directly inside `runReactLoop`: fewer files now, but every future cross-cutting concern would modify the loop.
- Make each tool call its own ad hoc hook: flexible for tools, but weaker for model and run-level concerns.

Rationale: OpenCode and Codex both keep strong protocol/processor boundaries. Stage 03 needs a small version of that pattern before plan guard, permissions, skills, memory, and audit arrive.

### Tool argument assembly is separate from execution

Provider tool-call deltas enter `ToolArgumentAccumulator`. It returns `partial`, `complete`, or `invalid`. Only `complete` emits an `ExecutableToolUse`; partial JSON cannot reach middleware, approval, runner, summary generation, UI input display, or executable transcript parts. A final invalid result creates a structured parse error result.

Alternatives considered:

- Keep Stage 02 behavior and ignore partial deltas: simpler, but real streaming tool calls cannot work reliably.
- Let the runner parse strings: mixes provider stream handling with execution and makes malformed JSON look like tool validation.

Rationale: The parse gate is the contract that protects both safety prompts and tool execution from half-formed input.

### Thinking is a hidden part, not renderer text

Provider reasoning fields and `<think>...</think>` content are split into `thinking_delta` events with `hidden: true`. Plain and Ink renderers ignore them by default. Stage 04 may decide if summaries or debug data should be persisted.

Alternatives considered:

- Strip thinking in provider adapters only: useful, but fixtures and later processors still need a shared rule.
- Render thinking as normal text: violates Stage 01/03 thinking safety and leaks model internals.

Rationale: Thinking/text separation must be visible at the event contract level so every renderer behaves consistently.

### UiEvent is live process state only

`src/foundation/ui-event.ts` defines renderer-agnostic current-turn events: text, thinking, tool start, tool result, bash progress, approval request, question request, turn done, and abort. `UiEvent` is not a transcript schema. Renderers can keep temporary state, but the UI state is not authoritative history.

Alternatives considered:

- Store renderer state as history: convenient for a TUI, but conflicts with transcript-first Stage 04.
- Let each renderer consume provider/tool events directly: faster locally, but duplicates filtering, summaries, progress, and batching logic.

Rationale: Stage 03 needs one live event stream, while Stage 04 owns durable message/part records.

### ToolUse summaries are shared by all renderers

`summarizeToolUse(toolUse)` converts complete executable tool inputs into `{ title, detail? }`. Plain and Ink renderers consume summaries instead of formatting raw JSON. Unknown tools still receive a generic title/detail.

Alternatives considered:

- Format JSON directly in renderers: easy but noisy and risky for long/sensitive input.
- Keep separate renderer-specific formatting: duplicates tool-specific logic and drifts quickly.

Rationale: Users need readable tool status, and renderers should not inspect raw provider payloads.

### HITL flows through a manager queue

`HumanInteractionManager` owns pending requests and promise resolution. Tools and middleware enqueue requests and wait; plain/Ink prompt subscribers render and resolve/reject. Approval, `ask_user_question`, future plan approval, MCP elicitation, and login prompts can share the same queue shape without importing Ink in tool code.

Alternatives considered:

- Make `ask_user_question` call Ink directly: simpler but couples tools to UI.
- Return a special provider message and hope the model asks the user in text: not structured or testable.

Rationale: HITL is a protocol concern, not an Ink component concern.

### Ink renderer batches high-frequency events

`createRenderBatcher` groups stream events into a 30-80ms flush window. Boundary events such as approval/question requests, abort, and turn done flush immediately. Plain output may still render linearly but should reuse the same summaries and thinking filter.

Alternatives considered:

- Update Ink state for every delta: can cause terminal flicker and input lag.
- Only render after turn completion: hides progress and defeats Stage 03.

Rationale: Current-turn TUI must feel responsive without turning stream frequency into React render frequency.

## Risks / Trade-offs

- Middleware hook order can be hard to reason about -> Keep a deterministic registration order and unit-test interception paths.
- Tool argument accumulator can dispatch incomplete JSON if final markers are misread -> Test split JSON, final malformed JSON, and non-object JSON separately.
- HITL prompts can hang on abort -> Manager requests must reject on abort and clear pending state.
- Renderer batching can hide boundary events -> Immediate flush for approval/question/abort/turn_done.
- Stage 03 can accidentally become a session store -> Keep UiEvent and renderer state explicitly non-authoritative and memory-only.

## Migration Plan

1. Add middleware, tool accumulator, reasoning splitter, tool state, and HITL manager as isolated modules with unit tests.
2. Add `UiEvent`, `summarizeToolUse`, render batcher, plain renderer projection, and Ink current-turn renderer.
3. Extend ReAct loop wiring to use middleware, accumulator, HITL, summaries, and UiEvents.
4. Add `ask_user_question` and approval middleware with fixture demos.
5. Add bash progress emission and abort handling.
6. Validate with Bun fixture demos and `bun test -- stage-03`.

Rollback is limited to Stage 03 modules and ReAct loop integration. No config or persisted data migration is required.

## Open Questions

- Should approval middleware default to prompting for all mutating tools or only `bash`, `write_file`, and `edit_file` in Stage 03?
- Should plain renderer prompt interaction be readline-based or fail fast in non-interactive mode?
- How much of current-turn tool state should be exposed to tests as public API versus kept internal?
