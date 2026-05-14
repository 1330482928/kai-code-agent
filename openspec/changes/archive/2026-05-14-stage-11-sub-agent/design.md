## Context

Stage 06 already established `ContextItem` and `ModelInputBuilder` as the only provider-input boundary, and Stage 10 added skills and memory context on that same path. Stage 11 should extend that boundary with a sub-agent slice that can run in isolation, then hand a bounded summary back to the parent as a `ContextItem(kind="subagent")`.

The goal is not to build a general multi-agent scheduler. The goal is a small, debuggable parent/child handoff that can support exploration and localized verification without leaking the child transcript into the parent prompt.

## Decisions

### 1. Define sub-agents with markdown frontmatter

Sub-agent definitions live in `.kai/agents/*.md`. Each definition includes a stable name, description, child prompt, allowlisted tools, optional skill list, and optional max turn cap. The loader only needs metadata and a compact prompt body to decide which child agent to run.

### 2. Keep child runs isolated from parent runs

The parent agent invokes `sub_agent` with a target definition and a task. The child run gets its own session-like execution context and can only use the allowlisted tools defined by the agent. The parent does not inherit the full child transcript; it only receives a bounded summary, changed files, and open questions.

### 3. Persist side transcripts separately

Child runs write a side transcript so the child execution is inspectable after the fact. The transcript is a first-class artifact, but it remains separate from the parent transcript and is not automatically injected as full context. The parent only sees a summarized `ContextItem(kind="subagent")`.

### 4. Inject child results through ContextItems

Sub-agent output must re-enter the main agent only through the existing context kernel. The parent receives summary, changed files, and open questions as a `ContextItem(kind="subagent")` before `ModelInputBuilder` assembles provider input. No direct provider-message splicing is allowed.

### 5. Keep the tool surface narrow

Stage 11 uses a single `sub_agent` tool and a simple CLI visibility command such as `kai agents list`. The child tool registry must be derived from the allowlist; the child cannot gain tools that the parent did not explicitly permit.

## Data Shape

```ts
export interface AgentDefinition {
  name: string;
  description: string;
  prompt: string;
  tools: string[];
  skills?: string[];
  maxTurns?: number;
}

export interface SubAgentResult {
  summary: string;
  changedFiles: string[];
  openQuestions: string[];
  sideTranscriptId: string;
  agentName: string;
}
```

## Implementation Shape

Planned modules:

- `src/agents/definitions.ts`: frontmatter parsing and definition discovery.
- `src/agents/runner.ts`: child loop orchestration, tool allowlist wiring, and result collection.
- `src/agents/transcript.ts`: side transcript persistence.
- `src/agents/context.ts`: bounded sub-agent summary ContextItem creation.
- `src/tools/sub-agent.ts`: `sub_agent` tool wrapper.
- `src/cli/main.ts`: `kai agents list`.
- `src/index.ts`: test-facing exports.
- `tests/stage-11-sub-agent.test.ts`: orchestration and regression tests.

## Testing Strategy

- Test definition discovery and `kai agents list` output.
- Test `sub_agent` child execution returns only a bounded summary payload.
- Test the parent does not inherit the full child transcript.
- Test `ContextItem(kind="subagent")` is produced and reaches the provider only through `ModelInputBuilder`.
- Test child tool allowlists reject undeclared tools.
- Run `openspec validate stage-11-sub-agent --strict`, focused Stage 11 tests, related context-kernel tests, and `git diff --check`.

## Risks

- If the child summary becomes too verbose, it can dominate the parent context budget.
- If the allowlist is not enforced at the child registry boundary, the isolation boundary becomes advisory only.
- If side transcript persistence is coupled too tightly to the parent session store, the implementation will be harder to reason about and test.

