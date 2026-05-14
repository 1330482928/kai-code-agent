## Why

The repository has Stage 10-14 implementation and archive artifacts in the worktree, while several active OpenSpec changes are stale or duplicated and the current TypeScript/test validation is not green. Before continuing Stage 15 context quality work, Kai needs a short stabilization pass so the next stage starts from a coherent, reviewable baseline.

## What Changes

### Motivation

- Restore the basic engineering contract: `tsc`, focused stage tests, and OpenSpec validation should agree on the current state.
- Avoid building Stage 15 on top of stale active changes, duplicate memory proposals, or context-quality files that are already present but not compiling.

### Scope

- Fix current TypeScript errors in Stage 15 readiness/context-quality surfaces.
- Verify Stage 10-14 behavior with Bun-first tests, and keep Node/Vitest behavior explicit where `bun:sqlite` is runtime-specific.
- Reconcile active OpenSpec changes:
  - keep `stage-15-context-quality` as the next real stage change;
  - mark or remove stale empty `stage-12-permission` and `stage-14-polish` active shells after confirming their archived versions exist;
  - decide whether `stage-13-memory-system` is superseded by archived `stage-13a-memory-core` and `stage-13b-memory-governance` or should remain as future follow-up.
- Add a small readiness validation checklist so future stage transitions do not depend on ad hoc manual inspection.

### Non-goals

- Do not implement new Stage 15 context quality features beyond making existing partial context-quality code compile and test cleanly.
- Do not redesign memory, permission, skills, sub-agent, or CLI behavior.
- Do not archive `stage-15-context-quality`; it remains the intended next substantive stage.
- Do not perform broad refactors or behavior changes unrelated to the current validation failures.

### Risks

- Active change cleanup can accidentally remove useful planning artifacts if done without checking archived equivalents.
- Fixing tests only for one runtime can hide Bun/Node differences; this pass must make the runtime boundary explicit.
- Stage 15 partial code may tempt feature expansion; keep edits limited to stabilization.

## Capabilities

### New Capabilities

- `stage-readiness`: Covers repository readiness checks before entering a new roadmap stage, including compile/test validation, stale OpenSpec change cleanup, runtime-specific test expectations, and a repeatable readiness checklist.

### Modified Capabilities

- `context-kernel`: Existing context-quality/debug surfaces must compile and remain compatible with Stage 06 context debug types before Stage 15 feature work proceeds.

## Impact

- May touch Stage 15 context-quality modules, CLI imports/exports, and tests that currently fail compilation.
- May update OpenSpec change directories for stale active changes after confirming their archived replacements.
- Adds or updates focused readiness tests/checklists.
- Expected validation includes `bun test` focused on Stage 10-14, `bun run check`, `pnpm exec openspec validate --specs`, and a final `git status` review.
