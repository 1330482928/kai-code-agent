## Context

Stage 03 established a middleware-backed ReAct loop, normalized streaming provider events, current-turn `UiEvent` rendering, HITL plumbing, bash progress events, and scriptable command output. The missing piece is durable conversation state: the loop can execute tools and stream UI, but there is no authoritative transcript that can be resumed, exported, audited, or used as the backing source for multi-turn chat.

Stage 04 introduces transcript persistence and the first session-backed chat shell. The transcript store is the durable fact source; `UiEvent` remains a live process event, and Ink/plain renderers remain projections. This keeps the design aligned with the roadmap rule that UI state must not become the recovery source.

The implementation targets Bun 1.3.x and should use `bun:sqlite` directly. Tests should use temporary databases and fixture providers, not real model credentials or network access. API keys remain in `~/.kai-code-agent/config.yaml`; session data must not duplicate secrets.

## Goals / Non-Goals

**Goals:**

- Persist sessions, messages, parts, tool calls, tool results, and minimal bash run metadata in a local SQLite database.
- Preserve model-visible `tool_result` content exactly as produced by `formatToolResultForModel`, so resume does not reformat historical tool outputs.
- Rebuild provider messages from transcript for `kai resume <session-id> "<task>"` and session-aware `kai run --session <id|new>`.
- Provide JSONL export and replay/debug commands for inspecting transcript facts and bash metadata.
- Add a minimal session-backed Ink chat shell for bare configured `kai` and `kai chat --session <id>`.
- Split chat input into a pure editor reducer, keyboard state machine, and command registry.
- Allow slash commands to produce `PromptSubmission` metadata for the next agent run instead of treating every slash command as a local-only CLI command.
- Keep Stage 03 fixture replay and command-mode output scriptable.

**Non-Goals:**

- No long-term memory, memory extraction, retrieval ranking, or citations.
- No background bash task table; Stage 04 persists bash summaries in transcript metadata only.
- No searchable transcript UI, themes, full layout polish, or published TUI experience.
- No durable approval settings or remembered permissions.
- No full slash command ecosystem; only enough commands to prove the command registry and metadata path.
- No database migration framework beyond idempotent schema initialization and schema version checks.

## Decisions

### 1. Use SQLite transcript tables instead of JSON-only session files

Use `bun:sqlite` with tables for `sessions`, `messages`, and `parts`. `parts.metadata_json` stores structured JSON for tool calls, tool results, thinking, summaries, and bash metadata. A JSONL export command provides human-readable debug output.

Alternatives considered:

- JSONL as the primary store: simpler to write, but awkward for session listing, message reconstruction, and future querying.
- Protocol-state-only persistence similar to Codex rollout items: closer to future agent protocol, but heavier than needed for Stage 04.
- OpenCode-style richer SQL schema with permission and background-task tables now: more complete, but it expands this stage beyond the minimal transcript loop.

Rationale: SQLite gives queryability and deterministic local tests with low code volume. JSONL stays as an export format, not the authority.

### 2. Store message/part facts, not UI renderer state

The store records durable facts: user text, assistant text/thinking/tool call/tool result parts, model-visible tool result content, timestamps, and metadata. It does not store `UiEvent` objects as renderer state. Chat history is rebuilt by a transcript projector, and current-turn UI still comes from Stage 03 events.

Alternatives considered:

- Store every `UiEvent`: easier to replay the exact terminal stream, but couples durable state to a live renderer contract.
- Store only provider messages: enough for resume, but weak for audit, bash metadata export, and chat history projection.

Rationale: transcript facts remain stable as UI evolves. This matches Claude-style transcript blocks and OpenCode message/part separation without adopting their full product schema.

### 3. Persist formatter-produced tool result content

For every tool result, persist both a concise raw result metadata summary and the exact `modelContent` returned by `formatToolResultForModel`. Resume rebuild uses the stored `modelContent`, not a regenerated formatter call.

Alternatives considered:

- Persist raw result only and reformat on resume: lower storage, but formatter changes would alter historical model context.
- Persist stdout/stderr fully: simpler debug story, but unsafe and unbounded.

Rationale: model context must be reproducible. Full command output remains bounded by existing tool policies and export summaries.

### 4. Derive BashRun metadata at the run-loop/session boundary

Persist minimal bash run metadata in `parts.metadata_json.bash`: `command`, `cwd`, `exitCode`, `interrupted`, output preview, output bytes, `startedAt`, and `endedAt`. The loop/session recorder can derive `cwd` and timestamps around tool execution while using existing bash result metadata for command, exit code, interruption, and previews.

Alternatives considered:

- Change the bash tool API to include every persistence field: more direct, but leaks transcript requirements into the tool.
- Add a `bash_runs` table now: useful later for background tasks and search, but not needed for Stage 04.

Rationale: Stage 04 needs audit-ready summaries without turning bash into a separate task subsystem. Stage 14 can split `bash_tasks` into its own queryable fact table.

### 5. Add a session recorder interface instead of binding the ReAct loop to SQLite

Extend `runReactLoop` with optional session hooks or a `SessionRecorder` abstraction. The loop emits durable milestones to the recorder: turn start, user message, assistant text/thinking parts, tool calls, tool results, and turn completion. The SQLite store implements this boundary outside the agent core.

Alternatives considered:

- Import SQLite store directly inside `react-loop.ts`: fewer files, but couples agent execution to one persistence implementation.
- Put all persistence in middleware only: attractive extension point, but middleware sees lifecycle hooks, not every provider/tool part with enough structure.

Rationale: the agent loop stays portable, and tests can use an in-memory/fake recorder.

### 6. Keep command mode scriptable and make bare interactive mode chat-backed

`kai run` remains plain stdout/stderr and can opt into sessions through `--session new` or `--session <id>`. `kai resume <id> "<task>"` is a command-mode shortcut for loading context and running one turn. Bare configured `kai` starts a minimal session-backed chat shell in an interactive terminal; non-TTY fallback remains plain prompt behavior.

Alternatives considered:

- Make every `kai run` create a visible session by default: useful, but it could surprise script users and tests.
- Keep bare `kai` as one-turn task entry until later: simpler, but misses the earliest viable point for complete conversation UX.

Rationale: command scripts stay stable, while interactive use moves toward the product direction.

### 7. Split input editor, key handling, and command registry

Create a pure `input-editor.ts` reducer for text, cursor, deletion, and history movement. `use-command-input.ts` translates Ink key events into editor actions, picker state, submission, and abort. `command-registry.ts` resolves slash commands to local actions, input transforms, or `PromptSubmission` metadata.

Alternatives considered:

- Put all input state into `ChatShell`: fastest first pass, but hard to test and likely to become unmaintainable.
- Implement a full command palette now: richer, but too much UI scope for Stage 04.

Rationale: pure reducers make cursor/history/slash behavior testable without a terminal and prepare for `/plan`, `/skill`, `/model`, and `/mode`.

### 8. PromptSubmission metadata is passed into run context but remains narrow

Slash context commands can return metadata such as `requestedProfile`, `requestedMode`, `requestedModel`, `requestedSkillName`, or `resumeSessionId`. Stage 04 records the metadata and passes it to the next run context, but only implements minimal behavior needed for tests and demo commands.

Alternatives considered:

- Treat slash commands as local-only UI commands: too limiting for future skills and plan mode.
- Fully implement profile/model/mode switching now: larger dependency on settings and provider management.

Rationale: this stage creates the contract without pulling in Stage 10 skills, Stage 12 permissions, or Stage 13 memory.

## Risks / Trade-offs

- [Risk] SQLite is Bun-specific and harder to run under Node-only test paths. → Keep Stage 04 validation on Bun, isolate `bun:sqlite` imports behind `src/session/sqlite-store.ts`, and use fake stores where Node/Vitest cannot load Bun APIs.
- [Risk] Persisting too much streaming detail can create large databases. → Store bounded text/metadata, rely on tool format policies, and do not persist full stdout/stderr by default.
- [Risk] Resume may accidentally include hidden thinking as normal assistant text. → Store thinking as its own part type and ensure rebuild/projector exclude it from ordinary visible content unless explicitly requested.
- [Risk] Middleware, HITL, and session recording can duplicate tool events. → Define recorder events at loop milestones and make middleware observation separate from persistence.
- [Risk] Chat shell can overrun Stage 04 scope. → Limit it to session id, history summaries, input, current-turn output, and basic slash/local commands.
- [Risk] Command-mode sessions could affect existing smoke tests. → Make session behavior opt-in for `kai run` unless `resume` or `--session` is used.
- [Risk] Bash metadata timing may be inaccurate if captured in the wrong layer. → Record start/end at the loop/session recorder boundary around actual tool execution or interception.
- [Risk] Future settings/approval persistence may conflict with session-only metadata. → Do not model remembered approvals as session facts; only store transcript facts and explicit prompt outcomes when they occur.

## Migration Plan

1. Add session types, schema, store, and temporary database tests without wiring CLI.
2. Add transcript rebuild/projector/export modules and fixture tests.
3. Add optional recorder support to the ReAct loop while preserving existing default behavior.
4. Wire `kai run --session`, `kai resume`, `kai sessions`, and JSONL export/replay commands.
5. Add chat input reducer, command registry, keyboard hook, and Ink chat shell.
6. Switch interactive bare `kai` with existing config to the chat shell, while preserving first-run Ink setup and non-TTY fallback.
7. Add fixture demos and Stage 04 validation commands.

Rollback strategy: if session wiring breaks command mode, disable session creation behind CLI flags and keep the Stage 03 run path as the default. The new tables are local-only and can be left unused.

## Open Questions

- Should `kai run` create a session by default, or only when `--session` is supplied? The proposal chooses opt-in for command mode to avoid surprising scripts.
- What should the default database path be: `~/.kai-code-agent/sessions.sqlite` or `~/.kai-code-agent/state/sessions.sqlite`? The implementation should choose one stable path and expose config only later if needed.
- Should hidden thinking be persisted by default or only summarized? The design allows a `thinking` part type but requires projectors and rebuild to keep it out of visible text by default.
- Which slash commands should be implemented in Stage 04 demos? Suggested minimum: `/help`, `/clear`, `/resume <id>`, `/model <name>` as metadata-only, and `/plan` as metadata-only.
