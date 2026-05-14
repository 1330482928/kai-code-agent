# Stage 13B: Memory Governance

## 1. Extraction pipeline

- [x] 1.1 Add post-turn memory candidate extraction.
- [x] 1.2 Add tests for candidate generation and dry-run behavior.

## 2. Secret guard

- [x] 2.1 Add secret/sensitive-data filtering before writes.
- [x] 2.2 Add tests for token/key/cookie/.env rejection.

## 3. Lifecycle

- [x] 3.1 Add lifecycle operations for stale, archive, delete, refresh, merge, and promote.
- [x] 3.2 Add tests for status transitions and merge/delete flows.

## 4. Policy and CLI

- [x] 4.1 Add policy controls for memory writes and lifecycle actions.
- [x] 4.2 Add CLI commands for memory governance operations.
- [x] 4.3 Add tests for policy gating and CLI smoke coverage.

## 5. Validation

- [x] 5.1 Run `openspec validate stage-13b-memory-governance --strict`.
- [x] 5.2 Run focused memory governance tests.
- [x] 5.3 Run `git diff --check`.
