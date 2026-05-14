# Stage 13: Memory System

## Why

Stage 10B established manual Memory v0, scope-aware visibility, deterministic retrieval, and middleware injection. That is useful, but it is still a manual record system. Stage 13 turns memory into a full long-term system with typed records, source provenance, citations, post-turn extraction, lifecycle operations, and secret safety controls.

The goal is to make memory explainable and auditable without turning it into a transcript mirror or a hidden side channel.

## What Changes

- Expand memory records with status, source provenance, confidence, tags, and lifecycle metadata.
- Add deterministic retrieval ranking with explainable score components and citation tracking.
- Add post-turn extraction via a constrained sub-agent flow that emits candidates before write.
- Add secret guard and sensitive-data gating before long-term writes.
- Add lifecycle commands for stale, merge, archive, refresh, delete, and promote.
- Expand the memory CLI with explain, citations, extract, and lifecycle operations.
- Add memory policy settings for auto-extract, default scope, and approval gates.

## Scope Boundaries

### In scope

- Typed/scoped memory records with source attribution.
- Retrieval ranking, top-k budgeting, and explanation output.
- Post-turn extraction sub-agent dry-run and approval path.
- Memory citations in session audit/export.
- Secret guard and sensitive path rejection.
- Memory lifecycle commands and status transitions.
- Memory settings and approval gates.

### Out of scope

- Replacing transcript or context kernel behavior.
- Skills discovery or sub-agent orchestration unrelated to memory extraction.
- Permission engine redesign beyond the existing approval path.
- Provider adapter changes specific to one model vendor.
- Lockfile or package-manager churn.

## Risks

- Extraction can overfit or leak sensitive data if guardrails are too weak.
- Retrieval can become noisy if score and budget logic are not bounded.
- Lifecycle operations need clear status transitions or memory state will drift.

## Validation

- `openspec validate stage-13-memory-system --strict`
- Focused memory retrieval, extraction, citations, and lifecycle tests
- CLI coverage for `kai memory` explain/extract/citations/lifecycle flows
- `git diff --check`
