## 1. Stateful Reasoning Splitter

- [x] 1.1 Extend `src/agent/reasoning-splitter.ts` with a stateful streaming splitter API.
- [x] 1.2 Preserve the existing one-shot `splitReasoningParts` helper by implementing it on top of the stateful splitter or keeping compatible behavior.
- [x] 1.3 Support `<think>` and `</think>` tags split across arbitrary chunks.
- [x] 1.4 Support multiple think blocks, interleaved visible text, and case-insensitive tag names.
- [x] 1.5 Ensure final flush emits unclosed think block content only as hidden thinking, never visible text.
- [x] 1.6 Add splitter unit tests for split tags, single-chunk tags, multiple blocks, case-insensitive tags, visible/thinking interleave, and unclosed blocks.

## 2. OpenAI Provider Normalization

- [x] 2.1 Update `src/provider/openai.ts` to keep one reasoning splitter state across all streamed content chunks in a provider response.
- [x] 2.2 Flush pending reasoning splitter state before emitting `done`.
- [x] 2.3 Normalize provider-native `reasoning_content`, `reasoning`, and `thinking` string fields from complete messages and deltas into hidden `thinking_delta`.
- [x] 2.4 Ensure native reasoning fields never pass through `text_delta` or assistant visible text.
- [x] 2.5 Keep tool-call delta handling unchanged and independent from reasoning normalization.

## 3. Run Loop and Renderer Guarantees

- [x] 3.1 Add run-loop regression coverage proving assistant visible message content only accumulates `text_delta`.
- [x] 3.2 Add plain renderer regression coverage proving `thinking_delta` writes nothing to stdout.
- [x] 3.3 Add Ink current-turn state regression coverage proving `thinking_delta` does not append to visible text.
- [x] 3.4 Avoid adding renderer-level raw string parsing as the primary hidden-thinking fix.

## 4. Stage 04 Alignment

- [x] 4.1 Review active Stage 04 session persistence artifacts and keep transcript projection requirements aligned with hidden thinking defaults.
- [x] 4.2 If Stage 04 transcript projector code exists during apply, add a test proving thinking parts are excluded from default history projection/plain replay/Ink display.
- [x] 4.3 If Stage 04 projector code does not exist yet, leave the requirement covered by this change specs and Stage 04 tasks.

## 5. Fixtures and Regression Tests

- [x] 5.1 Add OpenAI stream parser test for content chunks `<thi`, `nk>secret`, `</thi`, `nk>visible` with visible output only `visible`.
- [x] 5.2 Add OpenAI stream parser test for single chunk `<think>secret</think>visible`.
- [x] 5.3 Add OpenAI stream parser test for provider-native `reasoning_content`, `reasoning`, and `thinking` fields.
- [x] 5.4 Add CLI or run-loop fixture regression proving stdout does not contain `secret`, `<think>`, or `</think>`.
- [x] 5.5 Update `tests/stage-03.test.ts` or adjacent provider tests with the new coverage.

## 6. Validation

- [x] 6.1 Run `bun test -- stage-03`.
- [x] 6.2 Run relevant Stage 04 tests if Stage 04 implementation exists.
- [x] 6.3 Run `bun test`.
- [x] 6.4 Run `bun run check`.
- [x] 6.5 Run `openspec validate "fix-streaming-thinking-leak"`.
- [x] 6.6 Manually verify a real-provider or fixture task that previously exposed `<think>` no longer prints think tags or internal thinking text in normal output.
