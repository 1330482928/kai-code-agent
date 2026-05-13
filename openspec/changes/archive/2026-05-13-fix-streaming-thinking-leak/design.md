## Context

Stage 03 introduced `splitReasoningParts` and renderer-level `thinking_delta` handling, but the splitter is currently stateless. It can remove `<think>...</think>` only when both tags arrive in the same provider content string. Real OpenAI-compatible SSE streams can split content arbitrarily across chunks, which means partial tag text can be emitted as normal `text_delta` and reach stdout, assistant visible message content, and future Stage 04 transcript projections.

The provider layer is the correct boundary for this fix. By the time text reaches `runReactLoop`, renderer, or transcript projection, the stream must already be normalized into visible `text_delta` and hidden `thinking_delta` events.

## Goals / Non-Goals

**Goals:**

- Add a stateful streaming reasoning splitter that preserves state across provider content deltas.
- Keep the existing one-shot splitter behavior for complete strings.
- Ensure `<think>` and `</think>` tags are case-insensitive and may be split across arbitrary chunks.
- Support multiple think blocks and interleaved visible/thinking content.
- Ensure unclosed think blocks at stream end are emitted only as hidden thinking.
- Normalize provider-native `reasoning_content`, `reasoning`, and `thinking` string fields to hidden `thinking_delta`.
- Ensure `runReactLoop` assistant visible content cannot include hidden thinking because it only accumulates normalized `text_delta`.
- Keep plain and Ink renderer behavior simple: typed `thinking_delta` is ignored by default.
- Keep Stage 04 transcript projection aligned: thinking can be stored separately, but default visible history/replay must not show it.

**Non-Goals:**

- Do not implement a user-facing debug view for thinking.
- Do not filter `<think>` strings in renderers as the primary fix.
- Do not change provider request format, model config, middleware, tool execution, or HITL behavior.
- Do not require Stage 04 persistence implementation before this bug fix can be applied.

## Decisions

### 1. Normalize at the provider stream boundary

`OpenAIProvider` should feed every content delta through a persistent splitter state before emitting provider events. `runReactLoop`, renderers, and future transcript recorders should only see normalized `text_delta` and `thinking_delta`.

Alternatives considered:

- Renderer string filtering: avoids provider changes, but leaks hidden text into assistant messages, middleware observers, and transcript recorders.
- Run-loop filtering: stops assistant visible accumulation but still leaves provider events semantically wrong and risks duplicate filtering later.

Rationale: provider normalization is the earliest stable boundary and matches the existing Stage 03 design.

### 2. Use a small state machine with bounded tag lookbehind

The splitter should track whether it is currently inside a think block and buffer only enough pending text to disambiguate partial `<think>` / `</think>` tags. It should emit visible text only when it is known not to be part of a tag or thinking block.

Alternatives considered:

- Regex over accumulated full response: simple but delays all visible streaming and can grow unbounded.
- Full HTML/XML tokenizer: overkill for two known tags and less predictable for malformed model output.

Rationale: a dedicated state machine keeps streaming output responsive while handling arbitrary chunk boundaries.

### 3. Flush incomplete thinking as hidden content

If the provider stream ends while inside a think block, the splitter should emit buffered thinking as `thinking_delta` and then finish. It must not convert unclosed thinking into visible text.

Alternatives considered:

- Drop unclosed thinking entirely: safest for privacy but loses debug signal.
- Emit malformed tags as visible text: preserves exact model output but violates the hidden-thinking rule.

Rationale: hidden emission preserves optional debug data without leaking into default output.

### 4. Normalize provider-native reasoning fields independently

Each OpenAI-compatible chunk may contain `reasoning_content`; some compatible providers may instead use `reasoning` or `thinking`. String values from these fields should become `thinking_delta` directly and should not be passed through visible content logic.

Alternatives considered:

- Support only `reasoning_content`: narrower and leaves known compatible-provider variants leaking or disappearing unpredictably.
- Serialize non-string reasoning objects: risks exposing provider internals as visible text or storing oversized debug data.

Rationale: string reasoning fields are common enough to support; non-string payloads can be ignored until a provider requires structured handling.

### 5. Keep renderers typed and conservative

Plain and Ink renderers should continue to ignore `thinking_delta` by default. Regression tests should prove they do not render typed thinking, but the renderer must not be responsible for parsing raw `<think>` tags.

Rationale: renderers consume semantic events, not provider-specific markup.

## Risks / Trade-offs

- [Risk] Partial tag buffering could delay visible text ending with a prefix such as `<thi`. → Mitigate with tests around arbitrary chunk splits and a bounded prefix buffer.
- [Risk] Malformed model output could leave the splitter inside thinking until stream end. → Flush as hidden thinking at completion and never visible.
- [Risk] Native reasoning fields could contain empty or non-string payloads. → Emit only non-empty strings as hidden thinking and ignore unsupported shapes.
- [Risk] Stage 04 projector code may not exist when this fix is applied. → Include Stage 04 projector tests only if projector code is present; otherwise keep the Stage 04 OpenSpec design aligned.
- [Risk] Existing tests may assert exact provider event ordering. → Update tests to expect semantic hidden/visible events rather than raw content fragments.

## Migration Plan

1. Add stateful splitter types and tests in `src/agent/reasoning-splitter.ts`.
2. Update `src/provider/openai.ts` to keep splitter state across SSE chunks and flush it before `done`.
3. Add provider tests for split tags, single-chunk tags, multiple/case-insensitive tags, unclosed tags, and native reasoning fields.
4. Add Stage 03 run-loop and renderer regression tests proving stdout/assistant visible text excludes hidden thinking.
5. If Stage 04 projector exists during apply, add a projector regression test for hidden thinking parts.

## Open Questions

- Should unclosed thinking content be emitted as one final `thinking_delta` or split by received chunks? Either is acceptable as long as it is hidden; implementation should favor simpler tests and bounded memory.
- Should non-string `reasoning` fields be ignored or represented as debug metadata later? This change ignores them to avoid accidental visible leakage.
