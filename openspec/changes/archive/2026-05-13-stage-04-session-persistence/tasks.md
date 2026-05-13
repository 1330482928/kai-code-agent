## 1. Session Store Foundation

- [x] 1.1 Add `src/session/types.ts` with session, message, part, bash metadata, prompt submission, and recorder types.
- [x] 1.2 Add `src/session/schema.ts` with idempotent SQLite schema for `sessions`, `messages`, `parts`, and schema metadata.
- [x] 1.3 Add `src/session/sqlite-store.ts` using `bun:sqlite` for create/load/list session operations.
- [x] 1.4 Implement append/load APIs for messages and ordered parts with JSON metadata parsing and validation.
- [x] 1.5 Add temporary database tests for schema initialization, session creation, message append, part ordering, and reopen behavior.

## 2. Transcript Rebuild, Projection, and Export

- [x] 2.1 Add `src/session/rebuild.ts` to rebuild provider messages from transcript records.
- [x] 2.2 Ensure rebuild preserves stored tool result `modelContent` and matching tool call ids.
- [x] 2.3 Ensure rebuild excludes hidden thinking parts from ordinary visible assistant content by default.
- [x] 2.4 Add `src/session/projector.ts` to produce concise rendered history items for user, assistant, and tool parts.
- [x] 2.5 Add `src/session/export.ts` for JSONL export and plain replay projection.
- [x] 2.6 Add tests for rebuild, thinking isolation, tool result reproducibility, projector summaries, JSONL export, and replay output.

## 3. ReAct Loop Session Recorder

- [x] 3.1 Add a recorder interface to `runReactLoop` options without importing SQLite into agent core.
- [x] 3.2 Record user message and assistant message/part lifecycle for session-backed runs.
- [x] 3.3 Record executable tool call parts only after tool arguments are complete and parsed.
- [x] 3.4 Record tool result parts with exact formatter-produced model content.
- [x] 3.5 Derive and persist bash run metadata with command, cwd, exitCode, interrupted, preview, bytes, startedAt, and endedAt.
- [x] 3.6 Preserve Stage 03 behavior when no recorder is attached.
- [x] 3.7 Add tests for recorder event ordering, parse-error tool result recording, bash metadata recording, recorder failure behavior, and no-recorder compatibility.

## 4. CLI Session Commands

- [x] 4.1 Add session path resolution for default local state under `~/.kai-code-agent/` with test override support.
- [x] 4.2 Extend `kai run` parsing to support `--session new` and `--session <id>`.
- [x] 4.3 Add `kai resume <session-id> "<task>"` using transcript rebuild and the same tool-capable run loop.
- [x] 4.4 Add `kai sessions` listing with id, updated timestamp, message count, and concise summary.
- [x] 4.5 Add `kai sessions export <session-id>` JSONL export.
- [x] 4.6 Add `kai sessions replay <session-id>` plain transcript projection.
- [x] 4.7 Add concise session-not-found and persistence-error handling.
- [x] 4.8 Add CLI smoke tests for `run --session new`, `resume`, `sessions`, `sessions export`, `sessions replay`, and missing session errors.

## 5. Chat Input and Slash Commands

- [x] 5.1 Add `src/ui/input-editor.ts` with pure reducer for insert, cursor movement, backspace, delete, placeholder, and history navigation.
- [x] 5.2 Add input editor unit tests for cursor bounds, insertion, deletion, and history selection.
- [x] 5.3 Add `src/ui/command-registry.ts` with typed command results for local actions, input transforms, and `PromptSubmission`.
- [x] 5.4 Implement minimal commands for `/help`, `/clear`, `/resume <id>`, `/model <name>`, `/mode <name>`, and `/plan`.
- [x] 5.5 Add `src/ui/use-command-input.ts` to map Ink keyboard events to editor actions, picker state, submission, and abort.
- [x] 5.6 Add tests for slash picker open/close, arrow navigation, Tab/Enter accept, Escape close, Ctrl-C abort, local actions, and metadata submissions.

## 6. Session-backed Ink Chat Shell

- [x] 6.1 Add `src/ui/chat-shell.tsx` rendering session id, projected history, input editor state, slash picker, and current turn.
- [x] 6.2 Reuse Stage 03 `UiEvent` current-turn renderer and render batcher inside chat shell.
- [x] 6.3 Add `src/cli/chat.ts` to create or load a session and run a multi-turn chat loop.
- [x] 6.4 Wire `kai chat` and `kai chat --session <id>`.
- [x] 6.5 Switch bare configured `kai` in interactive terminals to the session-backed chat shell.
- [x] 6.6 Preserve first-run Ink setup and non-TTY fallback behavior.
- [x] 6.7 Add tests for chat shell state projection, current-turn event projection, session switching, clear action, prompt submission, and abort behavior.

## 7. Fixtures and Demo Data

- [x] 7.1 Add fixture provider scripts for session alpha creation and resume verification.
- [x] 7.2 Add fixture provider script for bash metadata persistence.
- [x] 7.3 Add fixture provider script for hidden thinking persistence and replay filtering.
- [x] 7.4 Add fixture provider script for slash metadata demo where the command registry influences prompt submission metadata.
- [x] 7.5 Preserve Stage 03 fixture commands and expected stdout/stderr behavior.

## 8. Validation

- [x] 8.1 Run `bun test -- stage-04`.
- [x] 8.2 Run `bun test`.
- [x] 8.3 Run `bun run check`.
- [x] 8.4 Run `bun run kai run --provider fixture --session new --script fixtures/session-alpha.json "remember alpha"`.
- [x] 8.5 Run `bun run kai resume <session-id> "what did I say?"` using the session from 8.4.
- [x] 8.6 Run `bun run kai run --provider fixture --session <session-id> --script fixtures/bash.json "run pwd"`.
- [x] 8.7 Run `bun run kai sessions`.
- [x] 8.8 Run `bun run kai sessions export <session-id>`.
- [x] 8.9 Run `bun run kai sessions replay <session-id>`.
- [x] 8.10 Run `openspec validate "stage-04-session-persistence"`.
