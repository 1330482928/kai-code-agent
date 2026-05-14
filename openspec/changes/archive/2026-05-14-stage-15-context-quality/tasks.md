# Stage 15: Context Quality Optimization After Real Usage

## 1. Trace export

- [x] 1.1 Add context trace export for real sessions.
- [x] 1.2 Add tests for exported ContextItems, budget, cut reasons, and model input digests.

## 2. Redaction

- [x] 2.1 Add trace redaction for secrets and sensitive local paths.
- [x] 2.2 Add tests for secret/token/private key/cookie/`.env` redaction.

## 3. Eval and replay

- [x] 3.1 Add eval fixture schemas for critical and forbidden facts.
- [x] 3.2 Add deterministic replay for context assembly and compaction.
- [x] 3.3 Add tests for replay stability.

## 4. Metrics and diffing

- [x] 4.1 Add context quality metrics.
- [x] 4.2 Add prompt debug diff tooling.
- [x] 4.3 Add tests for bounded metric and diff output.

## 5. Tuning and regression

- [x] 5.1 Add named tuning rules and report formatting.
- [x] 5.2 Add regression fixtures for Stage 06/10/11/13 context flows.
- [x] 5.3 Run `openspec validate stage-15-context-quality --strict`.
- [x] 5.4 Run focused trace/replay/diff tests.
- [x] 5.5 Run `git diff --check`.
