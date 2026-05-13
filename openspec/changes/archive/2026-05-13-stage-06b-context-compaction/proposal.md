## Why

Stage 06A established `ContextItem` and `ModelInputBuilder` as the provider-input boundary, but long sessions still have no compaction path, budget decisions are not user-inspectable, and prompt assembly cannot yet explain why context was included or cut. Stage 06B completes the Context Kernel loop before later stages add skills, memory, sub-agents, and larger tool surfaces that will increase context pressure.

## What Changes

- Add budget planning that estimates input tokens, reserves output budget, records per-item inclusion decisions, and explains cut reasons.
- Add compaction orchestration before provider calls so over-budget transcript history is summarized rather than physically deleted.
- Protect provider continuity by preserving assistant tool-call and tool-result pairs when selecting the retained tail.
- Persist compaction summaries as transcript data and project them back as `summary` ContextItems on resume.
- Add a scriptable prompt debug command for inspecting ContextItems, budget decisions, final ModelInput shape, and compaction results.
- Add deterministic tests and golden snapshots for budget cuts, compaction summaries, tool-pair protection, prompt debug output, and ModelInput stability.

## Scope

- Stage 06B covers local context management only: history compaction, budget tuning, transcript summary persistence, and prompt/debug observability.
- The implementation should remain compatible with real OpenAI-compatible providers and deterministic fixture providers.
- Existing hidden-thinking rules still apply: thinking content may appear in debug metadata only under explicit debug policy and must not become ordinary visible text.

## Non-goals

- No semantic memory, post-turn memory extraction, or retrieval ranking; those remain Stage 10 and Stage 13 work.
- No new code-editing tools or tool permission model changes; Stage 07 owns the next tool expansion.
- No exact tokenizer dependency is required in this stage; a conservative estimator is sufficient if decisions are deterministic and inspectable.
- No physical deletion of original transcript messages during compaction.

## Capabilities

### New Capabilities

- `prompt-debug`: Scriptable CLI inspection of ContextItems, budget decisions, compaction results, and provider-input snapshots.

### Modified Capabilities

- `context-kernel`: Adds budget planning, cut reasons, compaction summary items, and tool-pair-aware tail selection.
- `llm-run-loop`: Adds pre-provider compaction decisions and ensures provider input continues through `ModelInputBuilder`.
- `session-persistence`: Adds durable compaction summary recording and summary projection during resume/export/replay.

## Impact

- Affected code: `src/coding/context/*`, `src/coding/prompt/*`, `src/agent/react-loop.ts`, `src/session/*`, and CLI command wiring in `src/cli/main.ts`.
- Affected tests: Stage 06 context tests, run-loop fixture tests, session persistence tests, and prompt debug CLI smoke tests.
- Affected user workflows: long session resume, `kai run` and bare chat provider calls, `kai prompt --debug`, `kai sessions export`, and `kai sessions replay`.
- Dependencies: no mandatory new runtime service; fixture provider should support deterministic compaction tests, while real providers may be used manually for summary generation.

## Risks

- Token estimates can diverge from provider tokenization; mitigated by conservative thresholds, reserved output budget, and debug output that exposes estimates.
- Compaction can omit useful details; mitigated by a fixed summary schema, retained recent tail, and preservation of original transcript records.
- Tool continuation can break if tool calls/results are split; mitigated by turn splitting and explicit tool-pair protection tests.
- Prompt debug can leak sensitive information if unbounded; mitigated by secret masking, bounded item display, and safe defaults.
