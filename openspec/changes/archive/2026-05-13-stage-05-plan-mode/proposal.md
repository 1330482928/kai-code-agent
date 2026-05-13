## Why

Stage 04 made Kai session-backed, but every turn still runs as the same build-oriented agent. Stage 05 introduces a dedicated planning path so users or the model can gather context, write a reviewable plan, request approval, and only then hand approved intent back to build mode.

This is the right next step because plan/build separation needs the transcript, chat input metadata, HITL queue, middleware, and current-turn UI foundations from Stages 03 and 04.

## What Changes

- Add build and plan agent profiles with explicit tool availability, writable scopes, and prompt/context metadata.
- Add `/plan` slash flow that submits `PromptSubmission.metadata.requestedProfile="plan"` and `/plan open` as a local action for inspecting the current plan file.
- Add model-requested `plan_enter` and `plan_exit` tools so the model can switch into plan mode and request plan approval.
- Add a plan file store that writes Markdown plans under `.kai/plans/` when possible and falls back to `~/.kai-code-agent/plans/`.
- Add `kai plan open` as a scriptable inspection command for the current or specified session plan file.
- Add a plan guard middleware that allows read/search, `ask_user_question`, readonly bash, and plan-file writes while blocking workspace writes and mutating bash in plan profile.
- Add plan approval through `HumanInteractionManager`, reusing the HITL queue instead of coupling plan tools to Ink.
- Persist profile/plan metadata in session transcript facts so resume, replay, and handoff remain auditable.
- After approval, switch back to build profile and inject the approved plan into the next build-mode provider context.
- Add deterministic fixture coverage for `/plan`, `plan_enter`, plan-file write, rejected plan exit, approved plan exit, and build handoff.

## Capabilities

### New Capabilities

- `agent-profiles`: Defines build/plan profiles, active profile selection, allowed tools, writable scopes, and profile metadata passed into the run context.
- `plan-mode`: Covers plan file lifecycle, `plan_enter`, `plan_exit`, plan guard behavior, approval workflow, and approved-plan handoff.

### Modified Capabilities

- `command-input`: `/plan` and `/plan open` gain concrete behavior for entering plan profile and inspecting the active plan file.
- `core-tools`: Profile-aware tool registry composition adds plan tools and plan-safe tool exposure without changing Stage 02 tool contracts.
- `human-interaction`: Adds plan approval as a first-class HITL request type alongside approval and question prompts.
- `llm-run-loop`: Runs become profile-aware, can process model-requested plan transitions, and can inject approved plan context into build-mode provider input.
- `session-chat-shell`: Chat shell displays and updates active profile/plan state while keeping history transcript-backed.
- `session-persistence`: Session transcript records profile, plan file, approval result, and approved plan metadata without exposing hidden thinking as visible text.

## Impact

- New modules under `src/agent/`, `src/coding/profiles/`, and `src/coding/plan/` for profile definitions, plan store, plan tools, and plan guard middleware.
- CLI/chat wiring in `src/cli/main.ts`, `src/cli/chat.ts`, command registry, and Ink/plain prompt subscribers.
- Session recorder and transcript projector updates to preserve plan/profile metadata and replay concise plan events.
- Fixture scripts for plan mode and regression tests in `tests/stage-05.test.ts`.
- No external dependencies are expected; implementation should use existing Bun/TypeScript, middleware, tool registry, session store, and HITL primitives.

## Non-goals

- No general permission engine or remembered approval settings; those remain later-stage work.
- No full prompt composer, context kernel, or token-budget manager; Stage 06 owns richer context management.
- No long-term memory or retrieval integration.
- No product-polished plan UI beyond the minimal chat shell status, approval prompt, and plain command behavior.

## Risks

- Profile switching can corrupt session state if active profile is only kept in live UI state; it must be recorded as transcript/session metadata.
- Plan guard can be too permissive if readonly bash detection is vague; Stage 05 should start with a conservative allowlist and fail closed.
- Approved-plan injection can become hidden mutable prompt state; it should be explicit, bounded, and visible in session replay/export metadata.
- Plan approval must not let tools block forever in non-interactive mode; missing prompt subscribers need concise failure behavior.
