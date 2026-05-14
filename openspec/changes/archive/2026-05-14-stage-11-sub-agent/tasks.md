## 1. Agent definitions and CLI

- [x] 1.1 Add `.kai/agents/*.md` frontmatter parsing and discovery.
- [x] 1.2 Add `kai agents list` output for discovered definitions.
- [x] 1.3 Add tests for discovery, ordering, and bounded metadata loading.

## 2. Sub-agent runner

- [x] 2.1 Add a `sub_agent` tool that launches an isolated child run.
- [x] 2.2 Enforce child tool allowlists and max turn caps.
- [x] 2.3 Add tests for tool rejection, turn limiting, and isolated context.

## 3. Side transcript and result handoff

- [x] 3.1 Persist child runs in a separate side transcript artifact.
- [x] 3.2 Return summary, changed files, and open questions from child runs.
- [x] 3.3 Add tests proving the parent does not inherit the full child transcript.

## 4. ContextItem integration

- [x] 4.1 Build `ContextItem(kind="subagent")` from child results.
- [x] 4.2 Ensure the parent only receives sub-agent output through `ModelInputBuilder`.
- [x] 4.3 Add regression tests for bounded parent context and debug visibility.

## 5. Integration and validation

- [x] 5.1 Export sub-agent helpers from `src/index.ts` for tests.
- [x] 5.2 Keep permission engine expansion, memory lifecycle, and parallel scheduling out of scope.
- [x] 5.3 Run `openspec validate stage-11-sub-agent --strict`.
- [x] 5.4 Run focused Stage 11 tests, related context-kernel regression tests, and `git diff --check`.
