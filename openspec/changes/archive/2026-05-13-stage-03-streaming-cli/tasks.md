## 1. Middleware Pipeline

- [x] 1.1 Add `src/agent/middleware.ts` with middleware hook types, ordered execution, and abort-aware context objects.
- [x] 1.2 Wire `beforeAgentRun` and `afterAgentRun` around the ReAct loop lifecycle.
- [x] 1.3 Wire `beforeModel` and `afterModel` around provider calls, including replacement model input support.
- [x] 1.4 Wire `beforeToolUse` and `afterToolUse` around tool execution, including `ToolResult` interception.
- [x] 1.5 Add middleware unit tests for hook order, model input replacement, tool interception, after-tool observation, and abort behavior.

## 2. Stream Processing

- [x] 2.1 Add `src/agent/tool-accumulator.ts` with partial/complete/invalid assembly states keyed by tool call id.
- [x] 2.2 Extend provider events or stream processing so tool argument fragments can feed the accumulator without reaching runner or UI input display.
- [x] 2.3 Return structured parse-error tool results for final malformed tool arguments without executing tools.
- [x] 2.4 Add `src/agent/reasoning-splitter.ts` for provider reasoning fields and `<think>...</think>` cleanup.
- [x] 2.5 Add tests for split JSON arguments, final malformed JSON, non-object JSON, and hidden thinking output.

## 3. UI Event Foundation

- [x] 3.1 Add `src/foundation/ui-event.ts` with `UiEvent` variants for visible text, hidden thinking, tool lifecycle, bash progress, HITL requests, abort, and turn completion.
- [x] 3.2 Add `src/foundation/tool-summary.ts` with `summarizeToolUse` for bash, file tools, `ask_user_question`, and unknown tools.
- [x] 3.3 Add `src/agent/tool-state.ts` to track current-turn tool status by call id without becoming a transcript store.
- [x] 3.4 Emit `text_delta`, `thinking_delta`, `tool_start`, `tool_result`, `bash_progress`, abort, and turn completion events from the ReAct loop.
- [x] 3.5 Add tests for UiEvent ordering, hidden thinking filtering, tool summaries, and current-turn-only tool state.

## 4. Renderers and Batching

- [x] 4.1 Add `src/ui/render-batcher.ts` with 30-80ms batched flushing and immediate boundary-event flushing.
- [x] 4.2 Add or update `src/ui/plain/renderer.ts` to consume `UiEvent` while keeping command output scriptable.
- [x] 4.3 Add `src/ui/ink/turn-renderer.tsx` for current-turn rendering of visible text and tool status from `UiEvent`.
- [x] 4.4 Ensure plain and Ink renderers both use `summarizeToolUse` rather than raw JSON formatting.
- [x] 4.5 Add tests for renderer batching, plain hidden-thinking behavior, plain tool status output, and Ink current-turn state projection.

## 5. Human Interaction

- [x] 5.1 Add `src/agent/human-interaction-manager.ts` with enqueue, subscribe, resolve, reject, and abort cleanup.
- [x] 5.2 Add `src/ui/prompts/approval.tsx` and plain fallback behavior for approval requests.
- [x] 5.3 Add `src/ui/prompts/ask-user-question.tsx` and plain fallback behavior for structured questions.
- [x] 5.4 Add `src/coding/tools/ask-user-question.ts` with schema validation and HumanInteractionManager integration.
- [x] 5.5 Add `src/coding/middleware/approval.ts` with minimal approval middleware for mutating tools.
- [x] 5.6 Add tests for HITL queue resolution/rejection, non-interactive approval denial, `ask_user_question` success, and abort cleanup.

## 6. Bash Progress and Abort

- [x] 6.1 Update `bash` to emit `bash_progress` runtime events through `ToolContext.emit` while output is streaming.
- [x] 6.2 Convert tool runtime events into `UiEvent` values inside the ReAct loop.
- [x] 6.3 Add `src/cli/interrupt.ts` to translate Ctrl-C into an AbortController signal for the current turn.
- [x] 6.4 Ensure abort cancels provider streaming, pending HITL prompts, middleware, and tool execution.
- [x] 6.5 Add tests for bash progress events and Ctrl-C/abort smoke behavior.

## 7. CLI and Fixtures

- [x] 7.1 Wire `kai run` and bare `kai` to the middleware-backed loop and current-turn renderer selection.
- [x] 7.2 Add fixture demos for middleware interception, approval denial/approval success, `ask_user_question`, split tool JSON, hidden thinking, and bash progress.
- [x] 7.3 Preserve Stage 02 fixture demos and command compatibility.
- [x] 7.4 Add CLI smoke tests for middleware interception, structured question flow, split JSON tool args, thinking-hidden output, tool stream output, and abort behavior.

## 8. Validation

- [x] 8.1 Run `bun run kai run --provider fixture --script fixtures/middleware-intercept.json "try risky action"`.
- [x] 8.2 Run `bun run kai run --provider fixture --script fixtures/ask-user-question.json "clarify"`.
- [x] 8.3 Run `bun run kai run --provider fixture --script fixtures/tool-args-split-json.json "read file"`.
- [x] 8.4 Run `bun run kai run --provider fixture --script fixtures/thinking-hidden.json "answer"`.
- [x] 8.5 Run `bun run kai run --provider fixture --script fixtures/tool-stream.json "inspect file"`.
- [x] 8.6 Run `bun test -- stage-03`.
- [x] 8.7 Run `bun test`.
- [x] 8.8 Run `bun run check` or the repository's equivalent typecheck command.
