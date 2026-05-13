## Context

The repository currently contains a TypeScript CLI scaffold and roadmap, but `kai` does not yet configure a model or call an LLM. Stage 01 creates the first runnable product slice: a user configures one OpenAI-compatible model profile, sends one task, receives streamed assistant text, and gets a deterministic fixture path for tests.

This change crosses CLI, config, provider, agent loop, renderer, and tests. It also introduces one external dependency, `yaml`, and writes API keys to a user-level config file, so the design must settle configuration, streaming, security, and testability up front.

## Goals / Non-Goals

**Goals:**

- Make `kai` and `kai run "<task>"` execute a real model-backed one-turn loop.
- Store model configuration outside the repository at `~/.kai-code-agent/config.yaml`.
- Provide a first-run wizard for missing default model profiles.
- Support `Minimax Global` and `Other` presets while keeping the internal adapter type `openai`.
- Normalize real provider and fixture provider output behind the same async event stream.
- Keep tests deterministic and network-free through fixture replay and temporary config paths.

**Non-Goals:**

- No tools, tool calls, tool result continuation, or model function calling.
- No session store, resume, multi-turn persistence, or context compaction.
- No permission engine or workspace mutation.
- No provider retry policy beyond surfacing a clear provider error.
- No encrypted keychain integration; local YAML plus `0600` permissions is the Stage 01 security boundary.

## Decisions

### User-level YAML config is the source of truth

Stage 01 stores config at `~/.kai-code-agent/config.yaml` with this shape:

```yaml
version: 1
defaultModel: minimax-global
models:
  minimax-global:
    preset: Minimax Global
    provider: openai
    baseURL: https://api.minimax.io/v1
    apiKey: sk-...
    model: MiniMax-Text-01
```

The config loader validates this with zod after YAML parsing and rejects missing `defaultModel`, missing model profiles, or incomplete profile fields.

Alternative considered: project-local config. That is deferred because Stage 01 stores API keys, and project-root secrets are too easy to commit. Later stages can add project-level non-secret overrides.

### First-run setup resolves a usable default profile before the loop starts

`ensureModelConfig()` is responsible for loading config, detecting missing or invalid defaults, running the wizard, saving the result, and returning a valid default profile. The `Minimax Global` preset fills `provider=openai` and `baseURL=https://api.minimax.io/v1`; `Other` asks for baseURL and allows provider input defaulting to `openai`.

Alternative considered: fail fast with instructions. The wizard is preferable for a personal CLI because Stage 01 is about proving the real API path with minimum setup friction.

### Provider API uses a narrow OpenAI-compatible streaming subset

`OpenAIProvider` posts to `{baseURL}/chat/completions` with `model`, `messages`, and `stream: true`, using the profile API key as a bearer token. The adapter parses server-sent streaming chunks into internal events:

- `{ type: "text_delta", text }`
- `{ type: "usage", inputTokens?, outputTokens? }`
- `{ type: "done" }`

This mirrors OpenCode's provider boundary idea while staying much smaller than full provider registries. Claude Code and Codex have richer protocol/event handling, but Stage 01 only needs text streaming and provider error summaries.

### The loop is one turn and memory-only

`runOnce()` builds a user message, streams provider events, renders text deltas, accumulates assistant content, and returns the messages for that turn. It does not write a transcript, session ID, or store record.

Alternative considered: introduce the final session abstraction immediately. That would pull Stage 04 concerns forward and obscure the goal of proving a real LLM call first.

### Fixture provider is an explicit test and replay substitute

The fixture provider reads local scripted events and emits the same `ProviderEvent` contract as the real provider. CLI fixture flags are acceptable for demos and smoke tests, but fixture must not become the default user path.

Alternative considered: mock provider methods directly in tests. Fixture replay gives repeatable CLI-level tests and keeps tests closer to the real streaming loop.

### Config path and IO are injectable for tests

Config functions accept a path override or dependency options so tests can use temporary directories. This avoids reading or writing the developer's real `~/.kai-code-agent/config.yaml`.

## Risks / Trade-offs

- Provider-compatible APIs can differ in streaming payload details -> keep parsing conservative, ignore unknown fields, and turn malformed chunks into clear provider errors.
- API keys are stored in plaintext -> store them only under the user config directory, write `0600`, redact display output, and avoid repo fixtures containing real keys.
- A first-run wizard is harder to smoke test than pure command parsing -> isolate prompt IO behind a small interface and test config assembly separately.
- No retry policy means transient provider failures fail the run -> acceptable for Stage 01; retry and recovery are planned for a later stage.
- One-turn memory limits usefulness -> intentional stage boundary; persistence and resume belong to Stage 04.

## Migration Plan

1. Replace scaffold CLI behavior with Stage 01 commands.
2. Add config, provider, loop, and renderer modules behind small exported interfaces.
3. Add fixture files and tests that run with temporary config paths.
4. Keep existing scaffold exports working where possible.

Rollback is straightforward because no repository data migration is introduced. Removing the new command behavior returns the project to scaffold state; user-level config files can remain unused.

## Open Questions

None blocking. Later stages can revisit project-level config overrides, keychain storage, provider retries, and persistent sessions.
