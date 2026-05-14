## Context

Kai currently has a small Stage 02 tool pack: read, write, exact edit, bash, and ask-user-question. Stage 06 added context budgeting, so large tool outputs can be bounded and explained, but the agent still lacks the core workflow primitives used in most coding tasks: fast search, file discovery, and structured multi-file patch application.

Stage 07 fills that gap without changing the provider protocol. `grep`, `glob`, and `apply_patch` are ordinary `ToolDef`s exposed through the existing registry, profile selection, middleware pipeline, formatter, UI summary, and session recorder paths.

## Goals / Non-Goals

**Goals:**

- Add `grep` and `glob` as bounded workspace search tools backed by ripgrep.
- Add `apply_patch` with a strict Codex-style patch grammar and deterministic parse errors.
- Convert parsed patches into a file change plan before any filesystem mutation.
- Validate all target paths are inside cwd before applying any change.
- Apply patch plans atomically at the tool level: any failure leaves all touched files unchanged.
- Expose search tools in build and plan profiles, and expose patch mutation only in build.
- Add Stage 07 tests and fixtures covering search, parse, apply, failures, path safety, formatter output, and profile exposure.

**Non-Goals:**

- No AST-aware edits, semantic search, background indexing, binary file patching, or formatter/linter execution.
- No automatic retry or recovery policy for failed tools; Stage 08 owns broader failure handling.
- No MCP search/filesystem provider; Stage 09 owns MCP.
- No changes to provider tool-call streaming or the ReAct loop algorithm.

## Decisions

### Decision 1: Use ripgrep for both `grep` and `glob`

`grep` SHALL shell out to `rg` for content search. `glob` SHALL shell out to `rg --files` and then apply a local pattern filter. This matches the Stage 07 roadmap and keeps file discovery consistent with what coding agents usually expect in gitignored workspaces.

Alternative considered: implement search directly with Node/Bun filesystem traversal. That avoids an external binary but duplicates ignore handling and performs worse on large repositories.

Impact: missing `rg` must be treated as a structured tool failure, not a process crash. Tests should cover the command construction through temporary workspaces and can skip or inject behavior if `rg` is unavailable.

### Decision 2: Keep search output bounded and model-friendly

`grep` output SHALL include relative path, one-based line number, and a bounded matching line preview. `glob` output SHALL include sorted relative paths. Both tools SHALL enforce result limits and include truncation metadata when more results exist.

Alternative considered: return raw `rg` stdout. Raw output is simple but hard to format consistently, can be too large, and loses structured metadata needed by the formatter and tests.

Impact: Stage 06 context budgeting receives concise model-visible tool results, and session persistence records bounded summaries rather than unbounded search output.

### Decision 3: Parse patch text into a plan before writing files

`apply_patch` SHALL parse the full patch into add/delete/update operations first. The parser supports:

```text
*** Begin Patch
*** Add File: path
+line
*** Delete File: path
*** Update File: path
*** Move to: new-path
@@
 context
-old
+new
*** End Patch
```

Alternative considered: apply while parsing. That makes error handling brittle because a later malformed hunk can leave earlier files modified.

Impact: parser errors are deterministic and can be tested independently from filesystem effects.

### Decision 4: Apply patch plans atomically

Patch application SHALL load all existing target files, compute every resulting file content in memory, and only write/delete after every path, existence, and hunk-match check succeeds. If any operation fails, no target file is modified.

Alternative considered: apply each file as soon as it validates. That is easier to implement but violates the Stage 07 requirement that matching failure should not write partial changes.

Impact: tests can assert file contents remain unchanged after parse, path, missing-file, and match failures.

### Decision 5: Start with exact and trim-aware hunk matching

Update hunks SHALL first try exact context matching. If exact matching fails, the implementation can retry with trim-end matching for line endings and trailing whitespace. More advanced normalized or fuzzy matching is explicitly out of scope for Stage 07.

Alternative considered: implement Codex's full multi-stage seek logic immediately. That is more capable but raises complexity before the local patch format and atomicity are proven.

Impact: failures remain clear and safe. Future stages can improve matching without changing the tool contract.

### Decision 6: Profile exposure is explicit

Build profile SHALL expose `grep`, `glob`, and `apply_patch`. Plan profile SHALL expose `grep` and `glob` because they are read-only planning tools, but it SHALL NOT expose `apply_patch`.

Alternative considered: expose all tools and rely on middleware. Profile-level filtering keeps provider schemas honest and reduces the chance of the model requesting disallowed mutation in plan mode.

Impact: profile tests must assert included and excluded tool names. Plan guard remains a second layer rather than the only defense.

## Risks / Trade-offs

- Missing ripgrep -> Return a structured execution failure with an install/use-bash hint instead of crashing.
- Large search result sets -> Enforce result limits, preview bounds, and truncation metadata.
- Patch grammar too strict -> Keep parse errors explicit and add fixture coverage; future lenient parsing can be added behind the same contract.
- Atomic apply touches many files -> Keep Stage 07 patch size bounded by input size and file count limits.
- Move/delete operations are risky -> Preflight all paths and require existing source/non-conflicting destination checks before writing.
- Plan profile mutation exposure -> Assert `apply_patch` is absent from plan provider schemas.

## Migration Plan

1. Add `src/patch/parser.ts`, `src/patch/apply.ts`, and summary helpers.
2. Add `src/coding/tools/grep.ts`, `glob.ts`, and `apply-patch.ts` using existing `ToolDef` conventions.
3. Register the new tools in the default registry and profile allow lists.
4. Extend tool summary/formatter behavior where needed for concise model-visible output.
5. Add fixtures and `tests/stage-07.test.ts`.
6. Run `bun test -- stage-07`, related Stage 02/03/05 tests, `bun run check`, and OpenSpec validation.

## Open Questions

- Should `glob` pattern matching support only `*`, `**`, and `?` initially, or include brace/extglob syntax later?
- Should `grep` expose case sensitivity and context-line options in Stage 07, or defer richer modes until search usage is observed?
- Should apply_patch support rename-only updates in the first implementation, or require content hunks when moving files?
