# Stage 14: Polish + Diagnostics + Bun Binary Release

## Why

Stage 13 completed the core capability set: skills, memory, sub-agent, and permissions now have staged, reviewable behavior. The next step is to make Kai feel like a daily CLI rather than a development scaffold. That means clearer diagnostics, visible settings composition, background task inspection, better tool output, and a real binary release path.

## What Changes

- Add `kai doctor` for environment and dependency diagnostics.
- Add `kai settings explain` for layered settings inspection and effective config reporting.
- Add background task tracking and `kai tasks list/read`.
- Add debug JSONL output and release-oriented metadata/documentation polish.
- Add `bash_status` and persistent output handling for long-running bash tasks.
- Prepare Bun binary release flow and improve examples/help text.

## Scope

In scope:

- CLI diagnostics and settings explanation.
- Background bash tasks and task output inspection.
- Debug JSONL logging and release/build metadata.
- User-facing help/errors/examples/documentation polish.

Out of scope:

- New agent capabilities.
- Permission engine redesign.
- Memory or sub-agent core behavior changes.
- Cloud sync or remote execution.

## Risks

- CLI polish can spread into many modules if not kept behind thin command boundaries.
- Background task persistence can become brittle if output/storage semantics are not bounded.
- Binary release work can accidentally pull in packaging churn; keep it tied to the Bun compile path already used by the repo.
