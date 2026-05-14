# Kai Code Agent Instructions

## Project Purpose

Kai Code Agent is a Bun-first TypeScript CLI code-agent project. It is built stage by stage from the design docs in `code-agent-roadmap/`, with OpenCode, Claude Code, and Codex used as architectural references. Do not copy reference source code or private prompts; extract design patterns and keep the implementation small, testable, and local to this repo.

Before making a stage-related change, read the relevant stage document under `code-agent-roadmap/stages/` plus `code-agent-roadmap/00-design-principles.md`. Treat the roadmap as the product/architecture contract, and keep code, tests, and docs aligned when behavior changes.

## Architecture Rules

- `foundation/` defines provider-agnostic contracts: model events, messages, tools, tool results, UI events, and summaries.
- `agent/` owns the generic ReAct loop, middleware pipeline, tool argument assembly, HITL manager, retries, and turn orchestration.
- `coding/` owns code-agent behavior: profiles, tools, plan mode, context, patch behavior, and coding-specific middleware.
- `provider/` and future `community/` adapters translate external LLM APIs into internal provider events.
- `ui/` renders state. Tools and middleware must not import Ink components directly.
- Keep transcript-first semantics: messages/parts are the durable truth; UI events are current-turn process events.
- Keep ContextItem-first semantics: project instructions, profiles, runtime context, history, summaries, skills, memory, permissions, and sub-agent results should enter model input through ContextItem and ModelInputBuilder.
- Keep middleware-first semantics: approval, plan guard, skills, memory, audit, and permissions should extend the loop through hooks instead of branching inside the core loop.

## Current Development Commands

Use the package scripts from the repo root:

```bash
bun install
bun run check
bun run test
bun run kai -- --version
```

For focused test runs, prefer Vitest filters through the package script, for example:

```bash
bun run test -- stage-03
bun run test -- stage-06
```

Do not assume Node is the primary runtime. Node compatibility is only a fallback where the current implementation requires it.

## Implementation Guidelines

- Use TypeScript ESM and existing local patterns.
- Keep files focused; add small modules when a boundary is real, but avoid helper extraction for one-off code.
- Preserve the tool-call parse gate: partial provider tool arguments must not reach tools, approval, UI parameter display, or executable transcript state.
- Never send raw ToolResult metadata or large outputs directly back to the model; use the model-visible formatter.
- Thinking/reasoning must not be normal user-visible text. Provider reasoning fields and `<think>...</think>` content should become hidden thinking events or thinking parts.
- Dangerous file, patch, shell, MCP, and sub-agent actions should flow through the permission/HITL boundary once that stage owns them.
- Keep project instruction files (`AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`) concise and stable because they are loaded into model context.

## Testing Expectations

- Add or update tests with behavior changes, especially for provider streaming, tool assembly, context building, session replay, and UI-visible output.
- Prefer asserting structured objects and provider/UI events over matching large strings.
- When changing user-visible output, cover both plain renderer and Ink state/update behavior where applicable.
- When changing context behavior, assert ContextItem order, debug metadata, token estimates, and provider input shape.
- Generated runtime state belongs under `.kai/` and should not be committed.

## Stage Discipline

- Respect the current requested stage. Do not implement later-stage systems unless the user explicitly asks or the current stage needs a small compatibility seam.
- If a later stage depends on a current bug fix, treat it as a carryover fix and keep the patch narrowly scoped.
- Update the relevant roadmap/stage document if the agreed design changes.
