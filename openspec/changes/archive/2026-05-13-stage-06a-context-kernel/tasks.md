## 1. Context Kernel Types

- [x] 1.1 Add `src/coding/context/items.ts` with `ContextItemKind`, `ContextItem`, `ContextItemSource`, `ContextBudget`, `ContextDebugItem`, and `ModelInputBuildResult` types.
- [x] 1.2 Add stable helper constructors for included/excluded context items with id, kind, source, priority, metadata, and cache stability flags.
- [x] 1.3 Add `src/coding/context/tokens.ts` with a deterministic rough token estimator for strings, messages, tool schemas, and ContextItems.
- [x] 1.4 Add tests for ContextItem helper defaults, empty-item handling, metadata preservation, and token estimate stability.

## 2. Context Producers

- [x] 2.1 Add `src/coding/prompt/base.ts` or equivalent base producer for Kai static instructions as `base` ContextItems.
- [x] 2.2 Add `src/coding/prompt/profiles.ts` that turns build and plan profiles into `profile` ContextItems.
- [x] 2.3 Add `src/coding/prompt/instructions.ts` to discover `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md` from cwd upward and emit bounded `instruction` ContextItems.
- [x] 2.4 Add deterministic instruction ordering tests that document root-first versus nearest-first behavior.
- [x] 2.5 Add `src/coding/prompt/runtime-context.ts` to emit bounded cwd/date/git/runtime `environment` ContextItems without failing when git is unavailable.
- [x] 2.6 Add `src/coding/context/current-user.ts` or equivalent producer that turns task text and `PromptSubmission.metadata` into a `current_user` or `history` ContextItem.
- [x] 2.7 Add tests for profile producer differences, instruction file loading, missing instruction files, runtime fallback, and prompt metadata preservation.

## 3. Transcript and Plan Projection

- [x] 3.1 Add `src/coding/context/history.ts` to project in-memory `Message[]` into ordered history ContextItems.
- [x] 3.2 Add session transcript projection helpers that turn `LoadedSession` messages and parts into history, tool result, summary, and plan fact ContextItems.
- [x] 3.3 Preserve assistant tool call ids and matching role `tool` messages when projected history is rebuilt into provider messages.
- [x] 3.4 Exclude hidden thinking parts from default history ContextItems while exposing exclusion metadata for debug.
- [x] 3.5 Convert approved plan handoff into a bounded `plan` ContextItem with plan path/status metadata.
- [x] 3.6 Ensure rejected plans and ordinary plan summaries are not injected as approved build context.
- [x] 3.7 Add tests for text history projection, tool call/result pair projection, thinking exclusion, approved plan injection, and rejected plan non-injection.

## 4. ModelInputBuilder

- [x] 4.1 Add `src/coding/context/model-input-builder.ts` with `ModelInputBuilder` and pure build options.
- [x] 4.2 Implement stable sorting and grouping of base/profile/instruction/environment/plan/history/current-user items into provider system and conversation messages.
- [x] 4.3 Attach profile-selected provider tool schemas as provider tools without serializing tool schemas into prompt text.
- [x] 4.4 Populate `ModelInputBuildResult` with provider input, system sections, messages, tools, generation defaults, debug items, estimated input tokens, and budget metadata.
- [x] 4.5 Keep all non-empty Stage 06A items included by default; record empty or disabled items with explicit cut reasons where useful.
- [x] 4.6 Add golden tests for deterministic item order, provider messages, tool schemas, debug metadata, and token totals.

## 5. Run Loop Integration

- [x] 5.1 Extend `RunReactLoopOptions` with context builder inputs or producer dependencies without importing provider-specific code.
- [x] 5.2 Replace direct initial message and approved-plan system-message assembly in `runReactLoop` with builder-backed provider input assembly.
- [x] 5.3 Preserve profile-specific registry selection and tool schemas across build, plan, and profile transitions.
- [x] 5.4 Preserve tool continuation behavior by rebuilding each provider request through ModelInputBuilder after assistant tool calls and formatted tool results are appended.
- [x] 5.5 Preserve existing middleware behavior and provide a transition path for `beforeModel` to inspect builder output.
- [x] 5.6 Add test hooks or dependency injection so tests can inspect the latest ContextItems and ModelInputBuildResult without printing debug output.
- [x] 5.7 Add compatibility tests proving text-only runs, tool runs, thinking-hidden runs, Stage 04 session runs, and Stage 05 plan handoff keep existing stdout/session behavior.

## 6. Session Resume and Compatibility Wrappers

- [x] 6.1 Update `src/session/rebuild.ts` so `rebuildProviderMessages` delegates to context history projection or shares the same projection primitives.
- [x] 6.2 Update CLI resume/session-backed run setup to pass loaded transcript facts to the context builder instead of prebuilt provider messages where feasible.
- [x] 6.3 Keep JSONL export and plain replay transcript projections unchanged and independent from context debug metadata.
- [x] 6.4 Add resume tests for prior text, prior tool results, hidden thinking, and approved plan context without duplicate manual system messages.

## 7. Public API and Fixtures

- [x] 7.1 Export Context Kernel types, producers, token estimator, and ModelInputBuilder from `src/index.ts`.
- [x] 7.2 Add deterministic fixtures under `fixtures/context/` or `fixtures/provider/` for context-kernel text, tool continuation, and approved-plan flows.
- [x] 7.3 Add `tests/stage-06.test.ts` covering core builder behavior and integration smoke paths.
- [x] 7.4 Ensure existing Stage 02-05 tests remain unchanged except where assertions need to verify builder-backed metadata.

## 8. Validation

- [x] 8.1 Run `bun test -- stage-06`.
- [x] 8.2 Run `bun test -- stage-04`.
- [x] 8.3 Run `bun test -- stage-05`.
- [x] 8.4 Run `bun test`.
- [x] 8.5 Run `bun run check`.
- [x] 8.6 Run `pnpm exec openspec validate stage-06a-context-kernel`.
- [x] 8.7 Manually run a fixture tool continuation and confirm stdout/session replay match pre-Stage 06 behavior.
- [x] 8.8 Manually run an approved-plan fixture and confirm provider input contains one bounded plan ContextItem and no duplicate approved-plan system message.
