## Context

The current run loop builds provider input directly from `initialMessages`, an optional approved-plan system message, the current user message, and profile-specific tool schemas. Session resume uses `rebuildProviderMessages`, while Stage 05 injects approved plans with a separate string helper. This works for the current stages, but it makes future skill, memory, sub-agent, permission, and prompt-debug features likely to add more ad hoc prompt assembly paths.

Stage 06A introduces a Context Kernel that keeps the transcript as the authority while representing every model-visible contribution as `ContextItem`. The first implementation should preserve existing user-visible behavior and provider message ordering, then make the assembly path observable and extensible.

## Goals / Non-Goals

**Goals:**

- Define stable `ContextItem`, `ContextItemKind`, `ContextBudget`, `ContextDebugItem`, and `ModelInputBuildResult` types.
- Add `ModelInputBuilder` as the only path from context items plus current run input to provider-facing `ProviderInput`.
- Add ContextItem producers for base Kai instructions, active agent profile, project instruction files, runtime environment, session transcript history, current user prompt, and approved plan handoff.
- Keep tool schemas profile-aware and preserve the Stage 03 tool continuation contract.
- Preserve Stage 04 transcript-first behavior: hidden thinking remains excluded by default, tool result `modelContent` remains exact, and resume still derives context from stored transcript.
- Provide deterministic builder tests for item ordering, metadata, and resulting provider messages.

**Non-Goals:**

- No compaction runner, summary generation, or context overflow retry.
- No user-facing `kai prompt --debug` command.
- No real tokenizer, provider-specific prompt cache policy, or model-specific budget tuning.
- No implementation of skills, memory retrieval, sub-agent context, or permission policy context.

## Decisions

### Decision 1: ContextItem lives in `coding/context`, not `foundation`

`foundation` should remain provider/tool/message primitives. `ContextItem` is a coding-agent concept because its kinds include profile, instruction, plan, skill, memory, permission, and sub-agent context. Keeping it under `src/coding/context` matches the roadmap layering and avoids making generic provider code understand product-specific context.

Alternative considered: define ContextItem in `foundation`. That would make later providers and low-level message types depend on Kai-specific context semantics too early.

### Decision 2: Builder returns current `ProviderInput` plus debug metadata

Provider adapters already consume `ProviderInput`. Stage 06A should not change the provider API shape more than necessary. `ModelInputBuilder` returns `ModelInputBuildResult` with `providerInput`, `system`, `messages`, `tools`, generation defaults, and debug items. The run loop sends only `providerInput` to providers, while tests and future debug CLI can inspect the rest.

Alternative considered: replace `ProviderInput` everywhere with `ModelInputBuildResult`. That makes providers aware of debug and budget internals and spreads context concerns into the community/provider layer.

### Decision 3: History projection remains transcript-derived

Session transcript stays authoritative. A new history producer projects loaded transcript or current in-memory loop messages into ContextItems and then into provider messages. It must preserve role order, assistant tool calls, matching tool result messages, and `modelContent` exactly. Hidden thinking remains a separate transcript part and is excluded by default.

Alternative considered: continue using `rebuildProviderMessages` directly for resume while only new context uses ContextItems. That would keep two assembly paths and undercut Stage 06's purpose.

### Decision 4: Approved plan becomes a plan ContextItem

Stage 05 currently injects approved plan context as a system message string. Stage 06A should preserve the visible content and bounds, but the source becomes `ContextItem(kind="plan", source="session.approvedPlan")`. The builder then places it in the stable system section for build profile only.

Alternative considered: keep approved plans as prebuilt system messages. That would leave the most important Stage 05 handoff outside the new kernel.

### Decision 5: Instruction files are additive and deterministic

The instruction loader should search from cwd upward for `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md`, returning `instruction` ContextItems sorted by nearest project path first or another documented stable order. Missing files are not errors. Loaded content is bounded by item-level limits so a very large instruction file cannot dominate Stage 06A behavior.

Alternative considered: only load one instruction filename. Supporting the common three filenames now avoids an immediate redesign when Stage 10 skills and project instructions start interacting.

### Decision 6: Stage 06A records budget metadata but does not crop history

Every item should have estimated tokens and debug inclusion metadata. However, all required items remain included unless empty or explicitly disabled. Real over-budget handling belongs to Stage 06B. This keeps Stage 06A focused and makes later budget tests compare against a stable item model.

Alternative considered: implement basic truncation immediately. That risks hiding regressions in resume/tool continuation before the pair-protection and compaction rules are designed.

### Decision 7: Middleware extension point is typed but minimal

The run loop may accept additional context item producers or middleware-provided context items, but Stage 06A only needs a simple dependency-injected list. Middleware must not directly mutate provider messages. Future skills, memory, todo, and permission features can append ContextItems through this seam.

Alternative considered: let middleware continue using `beforeModel` to return arbitrary `ProviderInput`. That keeps the old escape hatch. Stage 06A should instead make `beforeModel` observe or amend ContextItems, while preserving compatibility carefully during migration.

## Risks / Trade-offs

- Provider message ordering regression -> Add snapshot tests for text-only, tool continuation, resume, and approved-plan flows before removing old direct assembly.
- Tool call/result mismatch -> Keep transcript projection tests that assert assistant tool call ids and role `tool` messages remain paired.
- Hidden thinking leakage -> Preserve existing Stage 03/04 tests and add context-kernel tests that thinking parts do not become history visible text.
- Instruction loader surprises users -> Bound loaded content, record source paths in debug metadata, and avoid failing when files are missing or unreadable.
- Runtime context can become noisy -> Keep Stage 06A runtime context short and deterministic; deeper diagnostics belong to later prompt-debug work.
- Middleware migration may be too broad -> Keep existing tool middleware behavior untouched; only model-input assembly changes in this stage.

## Migration Plan

1. Add context types, token estimate helper, and debug item construction without wiring them into the run loop.
2. Implement producers for base/profile/instruction/runtime/plan/history/current-user items.
3. Implement `ModelInputBuilder` and prove it can reproduce current provider messages for existing Stage 03/04/05 flows.
4. Wire `runReactLoop` to build provider input through the builder while preserving profile-specific tool registry resolution.
5. Replace direct approved-plan system-message injection and resume message rebuild usage with ContextItem-based assembly.
6. Keep `rebuildProviderMessages` as a compatibility wrapper over the history/builder projection until callers are migrated.
7. Run `bun test -- stage-06`, `bun test`, `bun run check`, and `openspec validate stage-06a-context-kernel`.

Rollback is straightforward because provider adapters still receive the same `ProviderInput` shape. If regressions appear, revert the run-loop wiring while keeping pure context types and tests for follow-up.

## Open Questions

- Should Stage 06A expose a hidden developer-only snapshot command, or wait fully for `kai prompt --debug` in 06B? Current recommendation: wait for 06B.
- Should instruction file order be nearest-first or root-first? Current recommendation: root-first for broad policy then nearest overrides, with explicit tests documenting the choice.
- Should `beforeModel` middleware be allowed to return ProviderInput during the transition? Current recommendation: keep compatibility for this stage but add a new ContextItem path and tests around it.
