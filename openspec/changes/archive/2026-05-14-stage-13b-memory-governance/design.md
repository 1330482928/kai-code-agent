# Stage 13B: Memory Governance

## Context

Stage 13A already delivered the memory core:

- typed/statused memory records
- deterministic retrieval
- citations for injected memory

Stage 13B adds the governance layer that keeps the memory system safe and operable over time. It intentionally avoids changing the core retrieval contract.

## Design

### 1. Candidate extraction is a separate stage

Memory extraction runs after a turn completes and produces `MemoryCandidate[]` rather than directly writing records. This keeps extraction reviewable and allows secret guarding and policy checks before any durable write.

### 2. Secret guard blocks unsafe writes

Any candidate containing secrets, tokens, private keys, cookies, `.env` values, or similarly sensitive content is rejected or downgraded before persistence.

### 3. Lifecycle is explicit

Memory records can be moved through lifecycle operations such as `stale`, `archive`, `delete`, `refresh`, `merge`, and `promote`. These actions are operator-visible and auditable, not hidden background mutations.

### 4. Policy and CLI stay narrow

Policy decides when extraction may write and when lifecycle changes require confirmation. The CLI exposes only the memory governance commands needed to inspect, promote, archive, refresh, merge, and delete memory.

## Tradeoffs

- Splitting governance from core memory keeps review focused and lowers apply risk.
- A conservative default may require more explicit approvals, but that is preferable to silent memory pollution.
- Keeping extraction separate from retrieval avoids coupling writes to reads.

## Test plan

- Candidate extraction produces reviewable memory candidates.
- Secret guard rejects sensitive candidate content.
- Lifecycle commands update record status correctly.
- Policy/CLI commands respect approval and scope constraints.
