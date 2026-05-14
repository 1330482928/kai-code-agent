## 1. Baseline Audit

- [x] 1.1 Capture active OpenSpec changes, archived equivalents, and dirty worktree groups before editing.
- [x] 1.2 Reproduce the current validation failures with `bun run check`, focused Bun stage tests, OpenSpec validation, and the relevant Node/Vitest subset.
- [x] 1.3 Record which failures are compile issues, runtime-specific test issues, stale OpenSpec issues, or real behavior regressions.

## 2. Compile And Export Stabilization

- [x] 2.1 Fix CLI/context-quality import and export mismatches, including the missing `path` import and `renderContextQualityTrace` export surface.
- [x] 2.2 Fix context-quality TypeScript mismatches in diff, metrics, replay, and trace snapshot normalization without adding new Stage 15 feature behavior.
- [x] 2.3 Run `bun run check` and resolve remaining TypeScript failures in the readiness scope.

## 3. Test Runtime Stabilization

- [x] 3.1 Run focused Bun tests for Stage 10-14 behavior and fix failures caused by readiness-scope regressions.
- [x] 3.2 Make Node/Vitest behavior explicit for tests that depend on `bun:sqlite`, either by isolating them to Bun or documenting the runtime boundary.
- [x] 3.3 Re-check the Stage 11 sub-agent assertion under Bun and fix it only if it is a real behavior regression rather than a Node/runtime mismatch.

## 4. OpenSpec Cleanup

- [x] 4.1 Confirm archived equivalents for stale active `stage-12-permission` and `stage-14-polish` shells, then close or remove the stale active shells.
- [x] 4.2 Decide whether `stage-13-memory-system` is superseded by archived Stage 13A/13B work or should remain as a future follow-up, and document the decision.
- [x] 4.3 Keep `stage-15-context-quality` active for the next substantive Stage 15 change.

## 5. Final Readiness Validation

- [x] 5.1 Run `pnpm exec openspec validate --specs`.
- [x] 5.2 Run the focused Bun stage validation set.
- [x] 5.3 Run the agreed Node/Vitest subset or document runtime-specific exclusions.
- [x] 5.4 Run `git diff --check`.
- [x] 5.5 Produce a readiness summary with validation results, remaining risks, active changes, and the next recommended change.
