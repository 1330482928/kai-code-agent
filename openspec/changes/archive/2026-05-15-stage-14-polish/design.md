# Stage 14: Polish + Diagnostics + Bun Binary Release

## Context

Stage 14 is a release-prep stage. It assumes the staged capability work is done and focuses on making the CLI dependable for daily use: predictable diagnostics, inspectable settings, visible task state, and a reproducible binary build.

## Design

### 1. Diagnostics are first-class CLI commands

`kai doctor` should validate environment prerequisites and runtime assumptions. It should identify missing or misconfigured pieces without requiring users to trace through source code or debug logs.

### 2. Settings are explainable

`kai settings explain` should show the layered settings inputs, the effective merged result, and where each layer came from. This keeps user, project, and project-local configuration understandable.

### 3. Background tasks are inspectable

Long-running bash work should be tracked with explicit task records and readable task output. The CLI should expose task listing and readback without forcing users into the session transcript.

### 4. Debug output stays opt-in

Debug JSONL and trace-style output should exist for troubleshooting and evaluation, but they must remain opt-in and not clutter the default user experience.

### 5. Release path stays simple

The Bun compile path should remain the canonical local binary release path for this stage. Any additional wrapper or packaging idea should wait for later.

## Tradeoffs

- A narrower diagnostics stage makes release work testable without introducing new product behavior.
- Keeping bash background support inside the existing CLI avoids a second task-management subsystem.
- Binary release is useful now because it validates the existing Bun-first architecture under real packaging conditions.

## Test plan

- Doctor reports missing dependency/config conditions.
- Settings explain shows layered sources and effective output.
- Task listing and task output reading are stable.
- Debug JSONL can be enabled without changing normal output.
- Bun compile produces a runnable binary.
