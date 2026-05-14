# Stage 11: Sub-agent

## Why

Stage 10 established skills and manual memory on the shared ContextItem boundary, but the main agent still has no isolated execution path for exploration or localized verification. Stage 11 adds a first sub-agent slice so the parent agent can delegate bounded work to a child run, then receive only a compact summary and changed-file signal back through `ContextItem(kind="subagent")`.

This keeps the parent loop deterministic and debuggable while avoiding full-history leakage between parent and child runs.

## What Changes

- Add `.kai/agents/*.md` agent definitions with frontmatter metadata and a small loader.
- Add a `sub_agent` tool that starts an isolated child agent run with a bounded prompt and a scoped tool allowlist.
- Add side transcript persistence for child runs so the parent can inspect results without inheriting the full child transcript.
- Add `ContextItem(kind="subagent")` injection for child summaries, changed files, and open questions.
- Add CLI visibility for agent definitions, starting with `kai agents list`.
- Add fixture-backed tests and demo coverage for child execution, isolation, and summary handoff.

## Scope Boundaries

### In scope

- Agent definition discovery and list output.
- Sub-agent tool invocation and child run orchestration.
- Child context isolation with a bounded summary return path.
- Side transcript persistence.
- Sub-agent ContextItem projection into the parent model input pipeline.
- Tests for isolation, summary formatting, and command visibility.

### Out of scope

- Permission engine expansion or policy resolution.
- Parallel or background multi-agent scheduling.
- Memory extraction or memory lifecycle.
- Skills, memory, or provider adapter redesigns.
- Lockfile or package-manager changes.

## Risks

- Child runs can accidentally inherit too much context if the summary boundary is not enforced consistently.
- Tool allowlists must remain strict so sub-agents do not silently gain broader capabilities than the parent explicitly grants.
- Summary-only handoff must stay compact enough to fit the existing ContextItem budget.

## Validation

- `openspec validate stage-11-sub-agent --strict`
- Focused sub-agent CLI and orchestration tests
- Related ContextItem / ModelInputBuilder regression tests

