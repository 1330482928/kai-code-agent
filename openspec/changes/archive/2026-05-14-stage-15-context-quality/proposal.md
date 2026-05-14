# Stage 15: Context Quality Optimization After Real Usage

## Why

Stage 14 made Kai usable as a daily CLI. Stage 15 uses real usage traces to improve context quality: what gets injected, what gets trimmed, how stable the prompt is, and whether the model sees the right facts without stale noise or cache churn. The goal is to tune the existing context kernel, not add new agent capabilities.

## What Changes

- Add context trace export from real sessions.
- Add trace redaction for secrets and other sensitive data.
- Add eval fixture schemas for critical and forbidden facts.
- Add deterministic replay of context assembly and compaction.
- Add metrics and prompt debug diffing for comparing quality changes.
- Add tuning rules and a regression harness for Stage 06/10/11/13 context flows.

## Scope

In scope:

- Context trace export and redaction.
- Fixture-based replay and metric reporting.
- Prompt debug diff and tuning rules.
- Regression coverage for trace-driven context quality issues.

Out of scope:

- New memory or sub-agent behavior.
- New provider or permission features.
- Vector search, cloud sync, or online learning.
- Any bypass around the Stage 06 context builder.

## Risks

- Trace data can leak secrets if redaction is too weak.
- Replay can drift from real builds if it reimplements the builder instead of using the same path.
- Metric work can become a second prompt system if it is not kept read-only and diagnostic.
