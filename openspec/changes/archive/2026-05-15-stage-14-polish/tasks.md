# Stage 14: Polish + Diagnostics + Bun Binary Release

## 1. Diagnostics

- [x] 1.1 Add `kai doctor`.
- [x] 1.2 Add tests for missing dependency/config diagnostics.

## 2. Settings explain

- [x] 2.1 Add `kai settings explain`.
- [x] 2.2 Add tests for layered settings output and source reporting.

## 3. Background tasks

- [x] 3.1 Add bash background task tracking and output persistence.
- [x] 3.2 Add `kai tasks list/read`.
- [x] 3.3 Add tests for task state and output inspection.

## 4. Debug and release polish

- [x] 4.1 Add debug JSONL logging and release metadata/help polish.
- [x] 4.2 Add tests for debug output toggles and error/help formatting.
- [x] 4.3 Verify `bun build --compile` path.

## 5. Validation

- [x] 5.1 Run `openspec validate stage-14-polish --strict`.
- [x] 5.2 Run focused CLI and diagnostics tests.
- [x] 5.3 Run `git diff --check`.
