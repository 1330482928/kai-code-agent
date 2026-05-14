## Context

Kai has completed several roadmap stages in quick succession, and the worktree now contains Stage 10-14 implementation and archive artifacts plus early Stage 15 context-quality files. The active OpenSpec list is no longer clean: some changes are stale empty shells, one memory change appears duplicated by archived Stage 13A/13B work, and `stage-15-context-quality` is still the intended next substantive stage.

The current validation baseline is not green. TypeScript currently fails in CLI/context-quality surfaces, focused Bun tests are blocked by an export mismatch, and Node/Vitest exposes runtime-specific `bun:sqlite` issues. Continuing directly into Stage 15 would make those failures harder to separate from real context-quality feature work.

## Goals / Non-Goals

**Goals:**

- Restore a clear pre-Stage15 baseline where TypeScript, OpenSpec validation, and focused stage tests have known results.
- Fix existing context-quality and CLI compile/export issues without expanding Stage 15 feature scope.
- Reconcile stale or duplicated active OpenSpec changes so only meaningful future work remains active.
- Document a repeatable readiness checklist for future roadmap stage transitions.
- Make Bun-specific and Node/Vitest-specific test expectations explicit, especially around `bun:sqlite`.

**Non-Goals:**

- Do not implement new Stage 15 context-quality behavior beyond making already-present code compile and behave consistently.
- Do not redesign memory, permission, skills, sub-agent, MCP, middleware, or UI architecture.
- Do not archive `stage-15-context-quality`; that change remains active for the next feature stage.
- Do not perform broad style refactors or unrelated test rewrites.

## Decisions

### Treat readiness as a separate change

Create `stage-15-readiness-stabilization` as a short OpenSpec change before applying more Stage 15 work.

Rationale: Claude Code, OpenCode, and Codex all rely on a coherent execution baseline before deeper agent behavior changes. A separate readiness change keeps cleanup reviewable and prevents Stage 15 feature work from hiding repository health fixes.

Alternative considered: fold the cleanup into `stage-15-context-quality`. That would reduce one OpenSpec change, but it would blur whether changes are feature behavior or baseline repair.

### Keep Bun as the authoritative runtime for Bun-dependent behavior

Run Bun-first checks for stage behavior that depends on Bun APIs, including SQLite-backed transcript, permission, and memory persistence.

Rationale: The project runtime is Bun 1.3.x. `bun:sqlite` is not available under Node/Vitest, so Node-only failures in those suites must be made explicit rather than treated as product failures.

Alternative considered: shim `bun:sqlite` for Node tests during this pass. That creates a larger compatibility surface and is outside the goal of a short stabilization change.

### Fix context-quality compile surfaces without adding feature semantics

Resolve import/export/type mismatches around CLI context-quality commands, debug snapshots, trace rendering, metrics, diff, and replay.

Rationale: Stage 15 has already introduced context-quality files, but the readiness pass should only make them type-stable and testable. Full prompt-quality evaluation, tuning, and regression workflow remains in `stage-15-context-quality`.

Alternative considered: remove or hide the partial Stage 15 files until the later change. That would reduce immediate errors but discard useful work and make the next stage start from less concrete code.

### Reconcile active OpenSpec changes conservatively

Compare active changes against archived equivalents before removing or closing anything. Empty stale shells can be cleaned up once their archived changes are confirmed. `stage-13-memory-system` needs an explicit superseded-or-follow-up decision because archived Stage 13A/13B changes likely cover the actual memory implementation.

Rationale: OpenSpec is the project audit trail. Cleanup must preserve intentional planning artifacts and avoid deleting user work.

Alternative considered: delete all active changes except Stage 15. That is faster but risks losing useful future design context.

### End with a validation matrix and next-stage recommendation

The apply pass should produce a short readiness summary with commands, results, known runtime caveats, remaining active changes, and the recommended next change.

Rationale: Stage transitions should be repeatable. A summary makes the next `openspec-explore` or `openspec-apply-change` decision grounded in facts instead of memory of ad hoc shell output.

## Risks / Trade-offs

- Active OpenSpec cleanup removes useful planning context -> verify archived equivalents or document why a change remains active.
- Bun-only validation hides Node regressions -> keep Node/Vitest behavior explicit and isolate runtime-specific failures.
- Fixing Stage 15 partial code grows into feature work -> limit changes to compile stability, exports, deterministic fixtures, and focused failing tests.
- Existing dirty worktree contains user work -> inspect before editing touched files and avoid reverting unrelated changes.
- Readiness checks take longer than a normal feature pass -> prefer focused stage checks first, then broaden only after failures are understood.

## Migration Plan

1. Capture current active changes, archived equivalents, dirty file groups, and validation failures.
2. Fix compile/export/type issues in the smallest affected surfaces.
3. Run Bun-focused Stage 10-14 tests, OpenSpec validation, and the agreed Node/Vitest subset.
4. Clean up or document stale active OpenSpec changes.
5. Produce a readiness summary naming `stage-15-context-quality` as the next substantive change if validation is acceptable.

Rollback is straightforward because this change should not introduce migrations or durable data format changes. If a cleanup decision is wrong, restore the affected OpenSpec change directory from git or leave it active and document the reason.

## Open Questions

- Is `stage-13-memory-system` fully superseded by archived `stage-13a-memory-core` and `stage-13b-memory-governance`, or should it remain as a future integration follow-up?
- Should Node/Vitest continue to run any SQLite-backed tests, or should those be Bun-only with a pure adapter test kept for Node?
- Should the readiness checklist live only in the final apply summary, or also become a small roadmap appendix after validation proves useful?
