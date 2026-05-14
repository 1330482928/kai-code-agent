## 1. Search Tools

- [x] 1.1 Add `grep` tool input schema, tool definition, and handler under `src/coding/tools`.
- [x] 1.2 Implement ripgrep-backed content search with cwd path safety, result limits, line previews, and truncation metadata.
- [x] 1.3 Add `glob` tool input schema, tool definition, and handler under `src/coding/tools`.
- [x] 1.4 Implement ripgrep-backed file discovery with supported glob pattern filtering, cwd path safety, sorting, result limits, and truncation metadata.
- [x] 1.5 Return structured failures for missing `rg`, invalid patterns, escaped paths, and subprocess execution errors.

## 2. Patch Parser

- [x] 2.1 Add `src/patch` module structure and exported patch plan types.
- [x] 2.2 Implement strict `*** Begin Patch` / `*** End Patch` parsing for add, delete, update, and move operations.
- [x] 2.3 Parse update hunks into ordered context/remove/add line chunks with useful parse diagnostics.
- [x] 2.4 Add parser unit tests for add, delete, update, move, malformed markers, malformed hunks, and multiple file operations.

## 3. Patch Application

- [x] 3.1 Implement patch path preflight so every source and destination path resolves inside cwd before writes begin.
- [x] 3.2 Implement add-file planning with parent directory creation and existing-file conflict detection.
- [x] 3.3 Implement delete-file planning with missing-file detection.
- [x] 3.4 Implement update-file planning with exact and trim-end hunk matching.
- [x] 3.5 Implement move handling with destination conflict checks.
- [x] 3.6 Apply planned filesystem changes atomically after all operations validate, leaving all files unchanged on failure.
- [x] 3.7 Return touched file metadata, operation counts, and concise summaries for successful applications.

## 4. Tool Integration

- [x] 4.1 Add `apply_patch` tool wrapper that parses input, applies the plan, and maps parse/apply errors into structured `ToolResult`s.
- [x] 4.2 Register `grep`, `glob`, and `apply_patch` in the default tool registry.
- [x] 4.3 Update build profile allowed tools to include `grep`, `glob`, and `apply_patch`.
- [x] 4.4 Update plan profile allowed tools to include `grep` and `glob` while excluding `apply_patch`.
- [x] 4.5 Extend tool summaries and model-visible formatting for search and patch results where needed.

## 5. Fixtures and CLI Flows

- [x] 5.1 Add fixture provider scripts for grep, glob, successful apply_patch, and failed apply_patch flows.
- [x] 5.2 Add CLI smoke coverage for fixture-driven `kai run` search and patch tasks.
- [x] 5.3 Ensure session-backed runs record bounded search/patch tool results without unbounded file content.

## 6. Tests

- [x] 6.1 Add Stage 07 tests for grep matches, no matches, limits, path safety, and missing-rg or execution failures.
- [x] 6.2 Add Stage 07 tests for glob matches, no matches, limits, sorting, and path safety.
- [x] 6.3 Add Stage 07 tests for apply_patch add/delete/update/move success cases.
- [x] 6.4 Add Stage 07 tests proving parse, path, conflict, and hunk-match failures leave all target files unchanged.
- [x] 6.5 Add profile tests proving build exposes all Stage 07 tools and plan exposes only search tools.
- [x] 6.6 Add formatter/summary tests for grep, glob, and apply_patch model-visible output.

## 7. Validation

- [x] 7.1 Run `bun test -- stage-07` and fix failures.
- [x] 7.2 Run related Stage 02/03/05 tests for tool registry, run loop, and profile regressions.
- [x] 7.3 Run `bun run check`.
- [x] 7.4 Run `pnpm exec openspec validate stage-07-grep-glob-patch`.
- [x] 7.5 Manually smoke fixture commands for grep and apply_patch from the Stage 07 roadmap.
