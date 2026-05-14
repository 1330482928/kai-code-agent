## 1. Memory schema and store

- [ ] 1.1 Extend memory records with status, source provenance, confidence, tags, and expiration metadata.
- [ ] 1.2 Add store support for active/stale/archived transitions and lifecycle events.
- [ ] 1.3 Add tests for typed record persistence and lifecycle transitions.

## 2. Retrieval and injection

- [ ] 2.1 Implement explainable retrieval scoring and deterministic top-k ranking.
- [ ] 2.2 Add citation tracking for injected memory ContextItems.
- [ ] 2.3 Add tests for ranking, budget limits, and visibility filtering.

## 3. Extraction and safety

- [ ] 3.1 Add post-turn extraction candidate generation via a constrained sub-agent flow.
- [ ] 3.2 Add secret guard and sensitive-path gating before long-term writes.
- [ ] 3.3 Add tests for dry-run extraction and rejected sensitive candidates.

## 4. CLI and policy

- [ ] 4.1 Expand `kai memory` with explain, citations, extract, and lifecycle commands.
- [ ] 4.2 Add memory settings and approval gates for auto-extract and write scopes.
- [ ] 4.3 Add CLI and settings tests for the new commands and policy gates.

## 5. Validation

- [ ] 5.1 Run `openspec validate stage-13-memory-system --strict`.
- [ ] 5.2 Run focused memory and CLI tests.
- [ ] 5.3 Run `git diff --check`.
