## Why

Stage 03 made the agent loop stream tool and UI events, but every run is still effectively ephemeral. Stage 04 needs a transcript-first session store so runs can be resumed, audited, replayed, and used as the backing source for a minimal multi-turn chat shell.

This is also the right point to move bare interactive usage from a one-turn task entry toward a session-backed chat surface, while keeping command-mode runs scriptable and deferring full product polish to later stages.

## What Changes

- Add a Bun SQLite transcript store for sessions, messages, parts, tool calls, tool results, and minimal bash run metadata.
- Add provider message rebuilding from stored transcript data so `kai resume <session-id> "<task>"` can continue from prior context.
- Add JSONL export and replay/debug commands that expose transcript and bash run summaries without storing full unbounded stdout/stderr.
- Extend the ReAct loop and CLI run path to optionally attach a session store, persist user/assistant/tool parts, and preserve formatter-produced model content for resume.
- Add `kai sessions`, `kai resume <session-id> "<task>"`, and session-aware `kai run --session <id|new>`.
- Replace the bare configured `kai` one-turn task entry with a minimal session-backed Ink chat shell.
- Add `kai chat --session <id>` for multi-turn interactive chat with history summary, current-turn streaming output, and current session id display.
- Add pure input editor, command-input state machine, and command registry foundations for slash commands that can submit `PromptSubmission` metadata or local actions.
- Preserve Stage 03 command-mode output behavior and fixture replay compatibility.

Non-goals:

- No durable long-term memory, retrieval ranking, or memory extraction; transcript is not memory.
- No background bash task table, searchable transcript UI, theme system, complex layout, or publishing polish.
- No project/user settings system for remembered approvals; approval persistence stays in a later stage.
- No full slash command ecosystem; this stage only establishes the command registry and a minimal set of local/context commands.

Risks:

- Persisting every event can blur the boundary between live UI events and durable transcript facts; the store must remain authoritative and renderers must stay projections.
- Resume can become incorrect if formatted tool results are regenerated instead of stored; model-visible tool result content must be persisted.
- Chat TUI scope can expand quickly; this stage should stay at a minimal session-backed shell, not a full product UI.
- Bun SQLite creates a runtime-specific persistence path; tests need temporary stores and fixture providers to remain deterministic.

## Capabilities

### New Capabilities

- `session-persistence`: Transcript-first session storage, resume/rebuild behavior, JSONL export, and persisted bash run metadata.
- `session-chat-shell`: Minimal session-backed Ink chat shell for new/resumed sessions, history projection, current-turn rendering, and multi-turn submission.
- `command-input`: Pure input editor, keyboard command state machine, slash command registry, and `PromptSubmission` metadata flow.

### Modified Capabilities

- `llm-run-loop`: Run/resume paths become session-aware and can persist transcript parts while still supporting scriptable one-shot runs.
- `ink-terminal-ui`: Bare configured `kai` moves from one-turn task entry to the session-backed chat shell while first-run setup and command mode remain intact.

## Impact

- New files under `src/session/` for schema, store, rebuild, projection, and JSONL export.
- CLI changes in `src/cli/main.ts` and new session/chat command modules.
- ReAct loop options gain optional session recorder/projector hooks without coupling core tool execution to SQLite.
- New Ink chat shell and input modules under `src/ui/`.
- Additional fixture scripts for session creation, resume, bash metadata, replay/export, chat, and slash command behavior.
- Test coverage expands across Bun SQLite store behavior, transcript rebuild, JSONL export, CLI smoke, and input editor/state machine reducers.
