## Why

Real OpenAI-compatible streaming providers can split `<think>...</think>` tags across multiple content deltas. The current reasoning splitter only handles complete tags inside one string, so hidden reasoning can leak into stdout, assistant visible text, and later Stage 04 transcript projections.

This violates the Stage 01/03 expectation that thinking/reasoning is hidden by default and must be normalized before renderer or transcript projection boundaries.

## What Changes

- Add a stateful streaming reasoning splitter that can process incremental content chunks.
- Normalize split `<think>` tags before they become `text_delta`, including tags split across arbitrary SSE chunks such as `<thi`, `nk>secret`, `</thi`, `nk>visible`.
- Support multiple think blocks, mixed visible/thinking text, and case-insensitive `<think>` / `</think>` tags.
- Flush unclosed think blocks as hidden `thinking_delta` at stream completion, never as visible text.
- Normalize provider-native `reasoning_content`, `reasoning`, and `thinking` fields into hidden `thinking_delta`.
- Keep `runReactLoop` visible assistant accumulation restricted to provider `text_delta` only.
- Keep plain and Ink renderers ignoring `thinking_delta` by default.
- Align Stage 04 transcript design so thinking parts may be persisted separately for debug policy, but default history projection, plain replay, and Ink display never treat thinking as normal visible text.

Non-goals:

- No renderer-layer string filtering as the primary fix.
- No user-facing debug mode for showing hidden thinking.
- No change to tool-call accumulation or middleware behavior except preserving the existing visible/thinking boundary.

Risks:

- Stateful streaming parsing can accidentally hold back visible text near partial tag prefixes; tests must cover text around tag boundaries.
- Providers may use variant reasoning field names; unsupported object-shaped reasoning payloads should be ignored or summarized safely, not emitted as visible text.
- Stage 04 transcript implementation is still pending, so this change must specify the projection rule now and add tests only if projector code exists during apply.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-run-loop`: OpenAI-compatible streaming provider normalization becomes stateful for thinking tags and native reasoning fields; visible assistant text must exclude thinking content.
- `current-turn-ui`: UI event rendering and current-turn state projection must continue to ignore `thinking_delta` by default and must not rely on renderer string filtering to hide provider reasoning.

## Impact

- `src/agent/reasoning-splitter.ts`: new stateful splitter API plus existing one-shot compatibility helper.
- `src/provider/openai.ts`: use one shared splitter state across stream chunks and normalize `reasoning_content`, `reasoning`, and `thinking`.
- `src/agent/react-loop.ts`: regression verification that assistant visible text only accumulates `text_delta`.
- `src/ui/plain/renderer.ts` and `src/ui/ink/turn-renderer.tsx`: regression tests for default `thinking_delta` hiding.
- `tests/stage-03.test.ts` and provider tests: add split-tag, single-chunk, native reasoning, renderer, and run-loop leakage regressions.
- Stage 04 active change artifacts/tasks should remain aligned with the rule that transcript projection hides thinking parts by default.
