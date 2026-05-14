# Stage 13A: Memory Core

## Context

Stage 10B established manual memory records and scope-aware visibility. Stage 13A upgrades the core memory model without pulling in extraction or lifecycle complexity.

The design goal is bounded and audit-friendly: memory remains a model-input supplement, retrieval remains deterministic and explainable, and citations record why a memory item was injected.

## Decisions

### 1. Memory records gain status

Memory records should carry a status such as `active`, `stale`, or `archived`. Stage 13A uses that status for storage and retrieval filtering, but does not introduce lifecycle commands yet.

### 2. Retrieval stays explainable

Memory retrieval should return a deterministic score and a short reason for each match, so CLI and middleware can show why a record was selected.

### 3. Citations are recorded for injected memory

When memory middleware injects a memory ContextItem, the system records a citation entry tied to the session and memory record. This keeps injection auditable without exposing memory as a separate prompt channel.

### 4. Provider boundaries do not change

Memory continues to reach the model only through `ContextItem(kind="memory")` and `ModelInputBuilder`. Provider adapters should remain memory agnostic.

## Data Shape

```ts
export type MemoryStatus = "active" | "stale" | "archived";

export interface MemoryRecord {
  id: string;
  scope: "session" | "projectLocal" | "project" | "user";
  type: "preference" | "fact" | "decision" | "project" | "reference";
  status: MemoryStatus;
  text: string;
  projectIdentity?: string;
  projectCwd?: string;
  projectPath?: string;
  sourceSessionId?: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
  reason: string;
  matchedTerms: string[];
}

export interface MemoryCitation {
  memoryId: string;
  sessionId: string;
  injectedAt: string;
  reason: string;
  score: number;
}
```

## Implementation Shape

Planned modules:

- `src/memory/types.ts`: statused record and citation types.
- `src/memory/store.ts`: status persistence and retrieval storage.
- `src/memory/retrieval.ts`: scoring, reasons, and ranking.
- `src/memory/middleware.ts`: `ContextItem(kind="memory")` injection and citation wiring.
- `src/memory/citations.ts`: citation persistence.

## Testing Strategy

- Test statused record storage and retrieval filtering.
- Test deterministic ranking and reason output.
- Test injected memory produces citation records.
- Test middleware still emits only `ContextItem(kind="memory")`.
