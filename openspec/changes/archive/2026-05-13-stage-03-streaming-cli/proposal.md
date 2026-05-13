## Why

Stage 02 can execute tools through a generic ReAct loop, but the loop still owns too many concerns directly: tool-call assembly, approval, user questions, thinking filtering, tool progress, and rendering are not yet cleanly separated. Stage 03 introduces middleware, HITL queues, stream processing, and renderer-agnostic current-turn UI events so later stages can add plans, permissions, sessions, skills, memory, and richer TUI behavior without repeatedly rewriting the agent loop.

## What Changes

- Add a middleware pipeline around agent/model/tool execution with `beforeModel`, `afterModel`, `beforeToolUse`, and `afterToolUse` hooks.
- Add a tool argument accumulator and parse gate so streamed tool argument deltas only become executable tool uses after JSON parse succeeds.
- Add reasoning/text splitting so provider reasoning fields and `<think>...</think>` content remain hidden from normal renderer output.
- Add `UiEvent`, tool state, tool summaries, renderer batching, plain renderer updates, and a current-turn Ink renderer that project the same event stream.
- Add `HumanInteractionManager` and reusable prompt flow for approval and structured user questions.
- Add the model-callable `ask_user_question` tool and a minimal approval middleware.
- Connect `ToolContext.emit` to `bash_progress` UI events.
- Add Ctrl-C/AbortController handling for current turn cancellation.
- Preserve Stage 03 as current-turn UI only; durable transcript/session authority remains Stage 04.

## Scope

- Middleware is in-memory and scoped to a single run.
- HITL requests are queued through a manager and resolved by plain or Ink subscribers.
- `ask_user_question` returns structured answers to the model through normal tool result continuation.
- Renderer output uses `summarizeToolUse(toolUse)` and never displays raw half-parsed JSON tool input.
- Plain and Ink renderers consume the same `UiEvent` stream.
- Bash progress is live process UI only and is not persisted by Stage 03.

## Non-goals

- No session store, durable transcript, resume, or chat history rendering.
- No full permission policy engine or remembered approvals beyond the minimal approval middleware hook.
- No plan mode, skills, memory, MCP elicitation, OAuth/login prompt, or slash-command system.
- No background bash tasks or long-running command task records.
- No full multi-turn chat TUI; Stage 04 owns session-backed chat.

## Capabilities

### New Capabilities

- `middleware-pipeline`: Agent/model/tool middleware hooks, ordered execution, tool interception, and abort-aware run lifecycle.
- `human-interaction`: HITL manager queue, approval prompt flow, structured `ask_user_question` flow, and prompt subscribers.
- `current-turn-ui`: Renderer-agnostic `UiEvent` protocol, tool summaries, renderer batching, plain renderer projection, and current-turn Ink renderer.

### Modified Capabilities

- `llm-run-loop`: Middleware-backed ReAct loop, tool argument accumulator/parse gate, thinking/text splitting, current-turn UI event emission, and abort handling.
- `core-tools`: Adds `ask_user_question`, routes tool runtime events such as `bash_progress`, and ensures tool summaries/progress are available without exposing raw partial input.

## Impact

- Affected code: `src/agent/*`, `src/foundation/ui-event.ts`, `src/foundation/tool-summary.ts`, `src/foundation/tool.ts`, `src/coding/tools/*`, `src/coding/middleware/*`, `src/ui/plain/*`, `src/ui/ink/*`, `src/ui/prompts/*`, `src/ui/render-batcher.ts`, `src/cli/*`, tests, and fixtures.
- Internal APIs: ReAct loop options, provider/tool stream handling, tool context event emission, renderers, and tool registry exports will expand.
- Test surface: add fixture and unit coverage for middleware interception, split JSON tool arguments, final malformed arguments, hidden thinking, HITL queue behavior, approval/question prompts, bash progress, renderer batching, and Ctrl-C abort.
- No user config migration or persistent data migration is required.

## Risks

- The middleware pipeline can become too broad if every concern lands in one hook set; Stage 03 should keep hooks minimal and ordered.
- Partial tool arguments can leak if renderer or approval paths observe raw deltas; only complete parsed `ExecutableToolUse` may reach runner, approval, summaries, or UI input display.
- HITL can deadlock if prompts are not resolved/rejected on abort; manager requests must be abort-aware.
- Ink rendering can become choppy under high-frequency deltas; batching should be tested separately from component rendering.
- Stage 03 must not accidentally create a second transcript authority in UI state before Stage 04.
