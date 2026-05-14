# Stage 13A: Memory Core

## Why

Stage 10B gave Kai manual memory records, scope visibility, deterministic retrieval, and memory middleware injection. That is a solid base, but it still lacks typed/statused memory, explainable retrieval output, and citations for injected memory.

This slice keeps the stage narrow. It upgrades the memory core only, and leaves extraction, secret guard, lifecycle commands, and policy/CLI expansion for a later 13B change.

## What Changes

- Add typed and statused memory records.
- Make retrieval explainable with bounded score and reason output.
- Record citations when memory is injected into model input.
- Keep `ContextItem(kind="memory")` as the only provider-facing memory boundary.

## Scope Boundaries

### In scope

- Memory record typing and status.
- Retrieval scoring, top-k limits, and reason metadata.
- Memory injection through `ContextItem(kind="memory")`.
- Citation tracking for injected memory.

### Out of scope

- Post-turn extraction.
- Secret guard and sensitive-data gating.
- Lifecycle commands for stale, merge, archive, refresh, or promote.
- Memory CLI expansion beyond existing manual add/list/search/delete.
- Settings/policy gates for auto-extract or memory lifecycle.

## Risks

- If typed status or citations are added without a bounded retrieval contract, memory can become noisy or opaque again.
- If this slice grows into extraction or lifecycle, the validation surface will lose focus.

## Validation

- `openspec validate stage-13a-memory-core --strict`
- Focused memory retrieval and injection tests
- ContextItem and citation coverage
- `git diff --check`
