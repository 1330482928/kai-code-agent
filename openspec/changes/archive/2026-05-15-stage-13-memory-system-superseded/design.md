# Stage 13: Memory System

## Context

Stage 10B gave Kai manual memory records with scope visibility and deterministic retrieval. Stage 13 extends that model into a durable long-term memory system that can explain why a record was retrieved, track where it came from, and evolve its status over time.

The design must preserve the current architecture: memory enters the model through `ContextItem(kind="memory")`, retrieval stays bounded, and the context kernel remains the provider-input boundary.

## Decisions

### 1. Memory becomes typed and statused

Memory records carry scope, type, status, source provenance, confidence, tags, timestamps, and optional expiration metadata. `active` records may be injected; `stale` and `archived` records remain queryable but do not inject by default.

### 2. Retrieval is explainable and bounded

The retriever scores keyword overlap, scope fit, recency, confidence, and lifecycle state. It returns top-k results plus a human-readable explanation for each result and records citation metadata when a result is injected.

### 3. Extraction is candidate-first

Post-turn extraction runs as a constrained sub-agent flow. It reads transcript and prior memory, produces `MemoryCandidate[]`, and does not write directly. Sensitive or uncertain candidates are filtered or queued for approval.

### 4. Secret guard gates writes

Before a memory candidate can become a persisted record, a secret guard checks for tokens, cookies, keys, sensitive paths, and other high-risk content. Rejected candidates are not stored.

### 5. Lifecycle is explicit

Records can move between `active`, `stale`, and `archived`, and can be merged, refreshed, promoted, or deleted. Lifecycle transitions are surfaced through CLI and settings policy rather than hidden behind automatic churn.

### 6. Memory keeps the context boundary

Memory middleware emits `ContextItem(kind="memory")` values only. The provider adapter does not need memory-specific branches, and citations remain audit/debug data rather than prompt text.

## Data Shape

```ts
export type MemoryScope = "session" | "projectLocal" | "project" | "user";
export type MemoryType = "preference" | "feedback" | "decision" | "project" | "reference" | "fact";
export type MemoryStatus = "active" | "stale" | "archived";

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  type: MemoryType;
  status: MemoryStatus;
  text: string;
  tags: string[];
  source: {
    kind: "manual" | "extracted" | "imported";
    sessionId?: string;
    messageId?: string;
    toolCallId?: string;
    filePath?: string;
  };
  confidence: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

export interface MemoryCandidate {
  type: MemoryType;
  suggestedScope: MemoryScope;
  text: string;
  reason: string;
  confidence: number;
  sourceMessageIds: string[];
  risk: "low" | "medium" | "high";
}

export interface MemoryCitation {
  memoryId: string;
  sessionId: string;
  messageId?: string;
  injectedAt: string;
  reason: string;
  score: number;
}
```

## Implementation Shape

Planned modules:

- `src/memory/types.ts`: typed records, candidates, citations, lifecycle status.
- `src/memory/store.ts`: CRUD, search, events, and lifecycle persistence.
- `src/memory/retrieval.ts`: scoring, dedupe, top-k budgeting, and explanations.
- `src/memory/extractor.ts`: post-turn candidate generation.
- `src/memory/secret-guard.ts`: sensitive-content detection and write gating.
- `src/memory/citations.ts`: citation tracking and session audit export.
- `src/memory/lifecycle.ts`: stale, merge, archive, refresh, delete, and promote.
- `src/memory/middleware.ts`: `ContextItem(kind="memory")` injection boundary.
- `src/cli/memory.ts`: add/list/search/explain/extract/citations/lifecycle commands.
- `src/config/memory-settings.ts`: memory policy flags and approval gates.

## Testing Strategy

- Test typed memory storage and lifecycle transitions.
- Test retrieval ranking, budget limits, and explanations.
- Test extraction dry-run output and approval gating.
- Test secret guard rejects sensitive candidates.
- Test citations are recorded when memory is injected.
- Test CLI lifecycle and explain commands remain bounded.
