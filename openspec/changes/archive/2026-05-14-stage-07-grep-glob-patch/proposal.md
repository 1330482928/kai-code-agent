## Why

Kai can already read, write, edit, and run shell commands, but real coding tasks still lack fast workspace search and a structured multi-file patch primitive. Stage 07 adds the minimum high-leverage tools needed for codebase navigation and safe patch application before the project moves into broader failure handling and MCP work.

## What Changes

- Add a `grep` tool backed by `rg` for bounded content search with file, line, and match previews.
- Add a `glob` tool backed by `rg --files` plus pattern filtering for bounded file discovery.
- Add an `apply_patch` tool that parses Begin/End patch blocks into add, delete, update, and optional move plans.
- Apply patch plans only after validating every touched path stays inside the current working directory.
- Make patch application atomic at the tool level: parse, path, or match failure must leave all target files unchanged.
- Return structured tool results with concise summaries, touched file metadata, and model-visible bounded output.
- Update build and plan profile tool exposure so build can mutate via `apply_patch`, while plan mode can search with `grep`/`glob` but cannot patch workspace files.

## Scope

- Covers Stage 07 only: `grep`, `glob`, `apply_patch`, patch parsing, patch application, path safety, profile exposure, and tests.
- Search output is bounded and suitable for Stage 06 context budgeting and model-visible tool-result formatting.
- Patch grammar follows the Codex-style `*** Begin Patch` / `*** End Patch` shape with add, delete, update, and move forms.

## Non-goals

- No background tool tasks, retry policy, or advanced failure recovery; Stage 08 owns broader failure handling.
- No MCP filesystem/search integration; Stage 09 owns MCP.
- No semantic code search, AST patching, binary file editing, complex merge conflict resolution, or automatic formatter execution.
- No permission persistence changes beyond existing profile and path safety boundaries.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `core-tools`: Adds `grep`, `glob`, and `apply_patch` tools, including patch parser, path safety, atomic application, and bounded result formatting requirements.
- `agent-profiles`: Updates build and plan profile tool exposure so search tools are available where safe and workspace patch mutation is build-only.

## Impact

- Affected code: `src/coding/tools/*`, new `src/patch/*` helpers, profile registry wiring, tool result formatter/summary logic, fixtures, and tests.
- Affected specs: `core-tools` and `agent-profiles`.
- Runtime dependency: `rg`/ripgrep should be used when available; missing `rg` must produce a structured tool failure rather than crashing the agent loop.
- User workflows: model-driven code search, file discovery, and multi-file patch application through normal ReAct tool calls.

## Risks

- Patch parser ambiguity can cause unintended edits; mitigated by a strict grammar, explicit failure messages, and atomic application.
- Search results can overwhelm the model; mitigated by result limits, bounded previews, and metadata summaries.
- Path traversal or absolute path edits can mutate outside the workspace; mitigated by existing cwd path resolution plus all-file preflight checks.
- Plan mode could mutate accidentally if tool exposure is wrong; mitigated by profile-specific schema tests that exclude `apply_patch` from plan.
