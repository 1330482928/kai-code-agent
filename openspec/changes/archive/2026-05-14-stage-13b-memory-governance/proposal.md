# Stage 13B: Memory Governance

## Motivation

Stage 13A established typed/statused memory, deterministic retrieval, and citation tracking. Stage 13B completes the governance layer around that core: candidate extraction, secret guarding, lifecycle operations, and policy/CLI controls. The point of this split is to keep extraction risk and operational governance separate from the memory core itself.

## Scope

In scope:

- Post-turn memory candidate extraction.
- Secret and sensitive-data guardrails before any long-term write.
- Lifecycle operations for stale, archive, delete, refresh, merge, and promote.
- Policy and CLI controls for memory governance and extraction behavior.
- Reviewable candidate flows that stay conservative by default.

Out of scope:

- Further memory core shape changes, scope resolution, retrieval ranking, or citation format changes.
- Automatic write without guard/policy checks.
- Any permission engine redesign beyond using existing settings/policy hooks.
- Cloud sync, team memory, or remote storage backends.

## Non-goals

- Replace transcript, context loading, or skills with memory.
- Add vector search or ML-based fuzzy ranking.
- Auto-write every candidate by default.
- Introduce a new persistence layer beyond the existing local store.

## Risks

- Extraction can create noisy or sensitive candidates if guardrails are loose.
- Lifecycle commands can become too broad if they drift into core memory schema work.
- CLI policy controls can overgrow into a general settings system if not kept narrow.
