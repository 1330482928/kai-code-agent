## 1. Agent Profile Foundation

- [x] 1.1 Add `src/agent/profiles.ts` with `AgentProfileName`, `AgentProfile`, build profile, plan profile, writable scopes, and profile lookup helpers.
- [x] 1.2 Add profile resolution from `PromptSubmission.metadata.requestedProfile`, session metadata, and default build fallback.
- [x] 1.3 Add invalid-profile errors before provider requests are started.
- [x] 1.4 Add profile-aware tool registry construction that exposes build tools for build profile and plan-safe tools for plan profile.
- [x] 1.5 Add unit tests for profile resolution, unknown profile handling, and profile-specific provider tool schemas.

## 2. Plan File Store

- [x] 2.1 Add `src/coding/plan/store.ts` with plan path resolution, project `.kai/plans/` creation, user fallback under `~/.kai-code-agent/plans/`, and test override support.
- [x] 2.2 Implement plan file creation with timestamp/slug naming and stable metadata.
- [x] 2.3 Implement safe plan write/read APIs with Markdown content, byte count, updated timestamp, and bounded preview helpers.
- [x] 2.4 Implement active plan lookup from session metadata and latest plan fallback where appropriate.
- [x] 2.5 Add tests for project path creation, user fallback, write/read behavior, bounded previews, and no-active-plan errors.

## 3. Plan Tools and Tool Registry

- [x] 3.1 Add `src/coding/plan/tools.ts` with `plan_enter`, `plan_write`, and `plan_exit` tool definitions using the shared `ToolDef` protocol.
- [x] 3.2 Implement `plan_enter` as a transition request that returns target profile and active plan metadata.
- [x] 3.3 Implement `plan_write` so it writes only through `PlanStore` and never general workspace paths.
- [x] 3.4 Implement `plan_exit` validation for non-empty plans before requesting approval.
- [x] 3.5 Ensure plan tool results include JSON-safe metadata and are formatted through the normal tool-result pipeline.
- [x] 3.6 Add tests for plan tool input validation, successful plan writes, no-op plan enter while already planning, and empty-plan exit failure.

## 4. Plan Guard Middleware

- [x] 4.1 Add `src/coding/plan/readonly-bash.ts` with a conservative readonly command classifier.
- [x] 4.2 Add `src/coding/plan/guard-middleware.ts` that enforces plan-profile allowed tools and writable scopes.
- [x] 4.3 Allow read/search tools, `ask_user_question`, readonly bash, and plan tools in plan profile.
- [x] 4.4 Block `write_file`, `edit_file`, unknown mutating tools, and non-readonly bash with structured permission `ToolResult`s.
- [x] 4.5 Preserve build-profile behavior by making the guard a no-op outside plan profile.
- [x] 4.6 Add tests for allowed read commands, blocked workspace writes, allowed readonly bash, blocked mutating bash, and build-profile compatibility.

## 5. Plan Approval HITL

- [x] 5.1 Extend `HumanInteractionManager` request/response types to support `plan_approval`.
- [x] 5.2 Add plan approval enqueue/resolve/reject APIs that carry request id, session id, plan path, bounded plan body, and profile metadata.
- [x] 5.3 Emit `plan_approval_request` current-turn UI events when plan approval becomes pending.
- [x] 5.4 Add plain prompt handling for plan approval in command-interactive mode.
- [x] 5.5 Add Ink-compatible plan approval rendering or reuse existing approval prompt components with plan-specific payload.
- [x] 5.6 Ensure missing subscribers in non-interactive mode return a structured interaction failure instead of hanging.
- [x] 5.7 Add tests for approval granted, approval rejected, abort cleanup, UI event emission, and non-interactive failure.

## 6. Run Loop, Session, and Handoff Integration

- [x] 6.1 Extend `runReactLoop` options with active profile, profile metadata, plan context, and profile-aware registry/middleware inputs without importing plan storage into provider code.
- [x] 6.2 Record resolved profile and requested profile metadata with session-backed user messages or turn metadata.
- [x] 6.3 Handle `plan_enter` results by recording a profile transition and preparing subsequent plan-profile execution.
- [x] 6.4 Handle `plan_exit` approval results by recording approved/rejected plan metadata and next profile.
- [x] 6.5 Inject bounded approved-plan context into build-profile provider input after approval.
- [x] 6.6 Update transcript rebuild so approved plan context survives `kai resume`.
- [x] 6.7 Update JSONL export and plain replay to show plan entered, plan updated, plan approved, and plan rejected facts while hiding thinking.
- [x] 6.8 Add tests for profile recording, approved-plan injection, rejected-plan non-injection, resume rebuild after approval, and replay/export output.

## 7. CLI, Slash Commands, and Chat Shell

- [x] 7.1 Update `src/ui/command-registry.ts` so `/plan <prompt>` returns `PromptSubmission` metadata with `requestedProfile: "plan"`.
- [x] 7.2 Implement `/plan open` as a local action that does not record a user message or start a model turn.
- [x] 7.3 Update command input tests for `/plan`, `/plan open`, slash picker metadata, and empty `/plan` behavior.
- [x] 7.4 Update chat shell state to display active profile, plan mode status, and active plan path from session/run state.
- [x] 7.5 Add chat local action handling for no-active-plan and active-plan inspection.
- [x] 7.6 Add `kai plan open --session <id>` command mode support that prints plan path/content or a no-active-plan error.
- [x] 7.7 Preserve bare `kai`, `kai chat`, `kai run`, `kai resume`, and `kai sessions` Stage 04 behavior outside plan flow.
- [x] 7.8 Add CLI/chat tests for plan slash submission, plan open local action, `kai plan open`, profile status projection, and Stage 04 command compatibility.

## 8. Fixtures and Demo Coverage

- [x] 8.1 Add fixture provider script for user `/plan` entry and plan-profile response.
- [x] 8.2 Add fixture provider script for model-requested `plan_enter`.
- [x] 8.3 Add fixture provider script for writing a plan file through `plan_write`.
- [x] 8.4 Add fixture provider script for `plan_exit` approved flow and build-profile handoff.
- [x] 8.5 Add fixture provider script for `plan_exit` rejected flow and plan-profile continuation.
- [x] 8.6 Add fixture provider script for blocked mutating tool and blocked mutating bash in plan mode.
- [x] 8.7 Preserve existing Stage 03 and Stage 04 fixture commands and expected stdout/stderr behavior.

## 9. Validation

- [x] 9.1 Run `bun test -- stage-05`.
- [x] 9.2 Run `bun test`.
- [x] 9.3 Run `bun run check`.
- [x] 9.4 Run `bun run kai run --provider fixture --script fixtures/plan-enter.json "plan first"`.
- [x] 9.5 Run `bun run kai run --provider fixture --session new --script fixtures/plan-exit-approved.json "plan then build"`.
- [x] 9.6 Run `bun run kai plan open --session <session-id>` using the session from 9.5.
- [x] 9.7 Run `bun run kai sessions replay <session-id>` and verify plan approval facts are visible while hidden thinking is absent.
- [x] 9.8 Run `openspec validate "stage-05-plan-mode"`.
