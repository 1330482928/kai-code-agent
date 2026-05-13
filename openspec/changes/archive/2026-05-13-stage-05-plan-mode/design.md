## Context

Stage 03 introduced middleware, current-turn UI events, HITL prompts, tool result formatting, and tool-call accumulation. Stage 04 added transcript-backed sessions, command input metadata, and a minimal Ink chat shell. The remaining gap is execution intent: every turn still behaves like a build-capable agent even when the user or model needs a planning-only phase.

Stage 05 adds a narrow plan mode before the broader settings, permission, and context-kernel stages. The design follows OpenCode's profile separation for plan/build behavior and Claude Code's plan approval pattern, while keeping Codex-style explicit approval boundaries and deterministic fixture tests.

The transcript remains authoritative. Profile transitions, plan file path, approval outcome, and approved plan handoff must be recorded as transcript/session facts rather than only UI state. UiEvents remain live renderer projections.

## Goals / Non-Goals

**Goals:**

- Define `build` and `plan` agent profiles with explicit tool access and writable scopes.
- Let users enter planning with `/plan` and inspect the active plan with `/plan open`.
- Let the model request planning with `plan_enter` and request approval with `plan_exit`.
- Persist Markdown plan files under `.kai/plans/` when possible, with a user-level fallback.
- Enforce a conservative plan guard: read/search, readonly bash, questions, and plan file writes are allowed; workspace mutations are blocked.
- Route plan approval through `HumanInteractionManager` and existing prompt subscribers.
- Record plan/profile metadata for resume, export, replay, and build handoff.
- Inject approved plan context into the next build-mode provider input after approval.
- Keep command-mode and fixture replay scriptable.

**Non-Goals:**

- No general permission engine, settings-backed remembered approvals, or full policy DSL.
- No full prompt composer or context budget manager.
- No long-term memory, skill activation, or retrieval ranking.
- No polished plan browser UI; this stage only needs minimal chat shell status, plain output, and testable state transitions.
- No automatic code edits while active profile is `plan`.

## Decisions

### 1. Model plan/build as agent profiles, not boolean flags

Introduce an `AgentProfile` abstraction with `name`, prompt metadata, allowed tools, and writable scopes. `build` remains the default profile. `plan` is a restricted profile that can read, ask, run readonly bash, and write only the plan file.

Alternatives considered:

- A single `isPlanning` boolean in the run loop: cheaper, but permissions, prompt, UI labels, and future profiles would quickly diverge.
- Separate CLI commands only: scriptable, but misses model-requested `plan_enter` and chat handoff.

Rationale: OpenCode-style profiles give a stable contract for tool selection and later prompt composition without requiring Stage 06 context kernel.

### 2. Keep plan tools small and profile-aware

Add `plan_enter`, `plan_write`, and `plan_exit` as plan-mode tools. `plan_enter` can be available from build profile to request a transition. `plan_write` writes Markdown to the active plan file. `plan_exit` reads the plan and starts approval. The existing `write_file` and `edit_file` tools remain blocked in plan profile.

Alternatives considered:

- Reuse `write_file` for plan files: less code, but difficult to distinguish safe plan writes from workspace edits.
- Make `/plan` only a local UI action: useful for users, but does not support model-initiated planning.

Rationale: plan-specific tools give precise audit records and allow the plan guard to fail closed.

### 3. Use a conservative readonly bash classifier

Stage 05 should allow only a small command allowlist in plan mode, such as `pwd`, `ls`, `find`, `rg`, `grep`, `cat`, `sed`, `head`, `tail`, `wc`, `git status`, `git diff`, and `git log`. Unknown or shell-compound mutating commands fail with a permission result.

Alternatives considered:

- Full shell safety parser now: more robust, but belongs with the later permission stage.
- Allow all bash during planning: faster, but violates the plan-mode safety goal.

Rationale: the guard should be predictable and conservative until Stage 12 adds a richer permission system.

### 4. Store plans as Markdown files plus transcript metadata

The plan body lives in a Markdown file. The session transcript records plan path, profile transitions, approval result, and approved plan content or bounded summary metadata. Default path is `.kai/plans/<timestamp>-<slug>.md`; fallback is `~/.kai-code-agent/plans/<timestamp>-<slug>.md` when project path is unavailable.

Alternatives considered:

- Store plan text only in SQLite parts: easier resume, but poor inspectability and diffability.
- Store plan files only: simple, but replay/export/handoff lose an authoritative transcript fact.

Rationale: files are user-readable and diffable; transcript metadata keeps session recovery and audit coherent.

### 5. Plan approval is a HumanInteractionManager request

`plan_exit` enqueues a `plan_approval` request through `HumanInteractionManager`. Ink/plain subscribers render the plan path and bounded plan body, then resolve approved or rejected. Approved plans switch the active profile back to build and are injected into the next build-mode run context.

Alternatives considered:

- Have `plan_exit` directly render an Ink prompt: faster, but violates the HITL rule and breaks non-Ink execution.
- Treat plan approval as normal tool approval: reusable, but it needs distinct payload and replay semantics.

Rationale: plan approval is HITL, but it is not just tool execution permission; it has durable plan content and handoff behavior.

### 6. Command input controls entry; run loop owns execution context

`/plan` returns `PromptSubmission` metadata requesting the plan profile for the next turn. `/plan open` is a local action that opens or prints the current plan path. The run loop receives a profile-aware context and uses profile-specific tools/middleware.

Alternatives considered:

- Let command input mutate global profile directly: simpler UI, but brittle for command-mode, resume, and tests.
- Put profile choice only in CLI flags: scriptable, but not sufficient for chat.

Rationale: slash commands should submit metadata; execution context should be resolved at the CLI/session boundary.

### 7. Approved plan injection is explicit and bounded

After approval, the next build-mode provider request includes an explicit approved-plan context message or metadata-derived system prefix. The injected content is bounded and traceable to plan path/session metadata.

Alternatives considered:

- Keep approved plan only in hidden runtime state: easy but invisible and hard to debug.
- Append the full plan as assistant text: wrong role and can pollute transcript projection.

Rationale: build handoff must be inspectable and reproducible without confusing plan text with ordinary assistant output.

## Risks / Trade-offs

- [Risk] Plan mode can silently allow unsafe commands if readonly detection is too broad. → Use a small allowlist and return structured permission failures for unknown bash patterns.
- [Risk] Profile state can drift between chat UI, session store, and run loop. → Resolve active profile from prompt metadata/session metadata at turn start and record transitions immediately.
- [Risk] Plan approval may block in non-interactive command mode. → If no subscriber is available, return a structured failure instead of waiting forever.
- [Risk] Approved plan injection can exceed provider context budgets. → Bound the injected text and leave richer budgeting to Stage 06.
- [Risk] New plan tools may disturb Stage 02/03 fixture behavior. → Keep build profile defaults compatible and add fixture tests proving prior command-mode output remains stable.
- [Risk] `.kai/plans` writes introduce project files unexpectedly. → Only write through explicit plan flow, expose plan path in output/replay, and use user fallback when project path is not writable.

## Migration Plan

1. Add profile types and default build/plan profile definitions without wiring behavior.
2. Add plan store and plan tools with focused unit tests.
3. Add plan guard middleware and profile-aware tool registry composition.
4. Extend command registry and chat shell state for `/plan`, `/plan open`, active profile display, and plan status.
5. Extend run loop/session wiring for profile metadata, model-requested plan transitions, plan approval, and approved-plan injection.
6. Add plain/Ink plan approval subscribers and non-interactive failure behavior.
7. Add fixtures and Stage 05 smoke tests.

Rollback strategy: disable plan tools and profile metadata wiring while leaving profile definitions and plan files unused. Build profile behavior should remain equivalent to Stage 04 command-mode behavior.

## Open Questions

- Should `/plan open` launch an OS editor/browser or print the plan path/content in command mode? Stage 05 should prefer print/read behavior for testability and avoid GUI requirements.
- Should plan approval persist the full approved plan in SQLite or only a bounded summary plus plan path? The implementation can record bounded content and keep the file as the full source.
- Should `plan_enter` immediately stop the current build turn or continue as a tool result instructing the model to answer in plan profile next turn? The initial implementation should choose the simplest deterministic transition and cover it with fixtures.
