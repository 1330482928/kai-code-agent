## Why

Stage 05 introduced plan-aware execution, but provider input is still assembled from scattered message arrays, profile state, approved-plan injection, and transcript rebuild helpers. Stage 06A establishes a single Context Kernel and ModelInputBuilder so every model-visible input has an explicit source, priority, budget metadata, and stable assembly path before Stage 06B adds compaction and prompt debugging.

## What Changes

- Add a `ContextItem` abstraction for model-visible context, including kind, source, priority, estimated token metadata, stability flags, and arbitrary structured metadata.
- Add a `ModelInputBuilder` that is the single assembly path from context items, current user input, history, tools, and generation defaults into provider input.
- Add Stage 06A producers for base instructions, build/plan profile prompt, project instruction files, runtime context, transcript history, and approved plan context.
- Refactor the ReAct loop integration so provider calls consume ModelInputBuilder output instead of directly hand-writing provider message arrays.
- Preserve Stage 04/05 behavior for session replay, resume, hidden thinking, plan approval, and profile-specific tool schemas.
- Add tests and fixtures that prove deterministic item ordering, profile-specific context, approved-plan context, instruction-file loading, and session history projection.

### Scope

- Context Kernel and ModelInputBuilder only.
- Budget metadata and rough token estimates may be recorded, but no actual overflow compaction is required in this change.
- Runtime context may include cwd, date, git branch/status summary, and package/runtime facts when cheaply available.
- Instruction loading covers project-local `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md` discovered from cwd upward.

### Non-goals

- No Stage 06B compaction runner, summary generation, or summary persistence.
- No `kai prompt --debug` command yet; builder debug structures should be available for tests and later CLI rendering.
- No real tokenizer integration or provider-specific prompt cache tuning.
- No Stage 07 grep/glob/apply_patch tools.
- No Stage 10/11/13 skill, memory, or sub-agent retrieval implementation.

## Capabilities

### New Capabilities

- `context-kernel`: Represents all model-visible context as ContextItems and assembles provider input through a single ModelInputBuilder.

### Modified Capabilities

- `llm-run-loop`: Provider calls are built through ModelInputBuilder and carry context debug metadata without changing visible CLI behavior.
- `agent-profiles`: Build and plan profile prompt identity becomes profile ContextItems rather than ad hoc prompt strings.
- `plan-mode`: Approved plan handoff becomes an explicit plan ContextItem in build-profile provider input.
- `session-persistence`: Stored transcript messages can be projected into ContextItems for resume and model input assembly while preserving transcript as the source of truth.

## Impact

- Affected code: `src/agent/react-loop.ts`, `src/agent/profiles.ts`, `src/coding/context/*`, `src/coding/prompt/*`, `src/coding/plan/store.ts`, `src/session/rebuild.ts`, `src/session/types.ts`, `src/provider/types.ts`, and exports in `src/index.ts`.
- Affected tests: new `tests/stage-06.test.ts`, plus compatibility coverage for Stage 04/05 resume and approved-plan flows.
- New fixtures: deterministic context-kernel fixture scripts and optional instruction-file test fixtures.
- Risk: centralizing provider input assembly can regress tool continuation ordering, hidden-thinking exclusion, or approved-plan injection if message projection is not carefully tested.
