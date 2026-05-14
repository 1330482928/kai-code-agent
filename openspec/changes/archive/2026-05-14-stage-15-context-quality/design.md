# Stage 15: Context Quality Optimization After Real Usage

## Context

Stage 15 is a diagnostic and tuning stage. It assumes the Stage 14 CLI is available and focuses on trace export, replay, metrics, and prompt diffing so the existing context kernel can be improved with evidence rather than guesswork.

## Design

### 1. Trace export is a diagnostic artifact

The system should be able to export a session's context assembly data, including ContextItems, budget decisions, cut reasons, and a digest of the model input. Export is for debugging and evaluation, not for model execution.

### 2. Redaction is mandatory

Trace export must remove secrets, tokens, private keys, cookies, `.env` values, and sensitive local paths by default. A safe trace is a prerequisite for sharing or replaying quality data.

### 3. Replay uses the same builder path

Fixture replay should call the same context assembly path used in normal runs. It should not introduce a separate prompt builder that could diverge from production behavior.

### 4. Metrics stay descriptive

Metrics should report retained critical facts, stale/conflicting item counts, token ratios, compression, and cache-stable section churn. They should describe whether a change improved quality, not make a runtime policy decision.

### 5. Tuning rules are explicit and reversible

Ranking, budget, dedupe, and compaction rules should be represented as named tuning rules with clear rollback paths. This keeps the optimization process reviewable.

## Tradeoffs

- Keeping this stage read-only avoids conflating diagnostics with product behavior changes.
- Using real traces instead of synthetic assumptions gives better signal for ranking and budget work.
- The more we export, the more important bounded redaction and fixture hygiene become.

## Test plan

- Trace export is deterministic and redacted.
- Eval fixtures can encode critical and forbidden facts.
- Replay uses the same builder path and produces stable diffs.
- Metrics and prompt diff outputs are bounded and testable.
