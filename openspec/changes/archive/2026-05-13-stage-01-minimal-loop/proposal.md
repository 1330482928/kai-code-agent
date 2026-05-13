## Why

Kai Code Agent is currently a TypeScript CLI scaffold with roadmap documentation but no real model-backed agent loop. Stage 01 is needed now to establish the first executable product path: configure a real OpenAI-compatible model, send one user task, stream the assistant answer, and keep the resulting turn state in memory.

## What Changes

### Scope

- Add user-level model configuration at `~/.kai-code-agent/config.yaml`, including secure file permissions and schema validation.
- Add a first-run setup wizard that runs when no default model profile exists.
- Add built-in presets for `Minimax Global` and `Other`, with `Minimax Global` mapping to internal provider `openai` and `https://api.minimax.io/v1`.
- Add an OpenAI-compatible streaming provider adapter for the real API path.
- Add a fixture provider for deterministic tests, CI, and local replay only.
- Add the minimal agent loop that wraps a task as messages, consumes provider stream events, renders text deltas, and returns the assistant message for the turn.
- Add CLI support for `kai`, `kai run "<task>"`, `kai config show`, and fixture replay demo commands.

### Non-goals

- No tool calls, tool schemas, or tool-result continuation.
- No session persistence, resume, transcript store, or context compaction.
- No permission system, file editing, Bash execution, MCP, skills, or sub-agents.
- No multi-provider SDK abstraction beyond an OpenAI-compatible adapter and fixture provider.
- No project-root API key storage or project-level secret config.

### Risks

- Streaming response formats vary across OpenAI-compatible vendors; Stage 01 should implement a conservative text-delta parser and surface provider errors clearly.
- First-run tests must avoid touching the developer's real home config, so config path handling needs test injection.
- API keys are stored locally in YAML; Stage 01 mitigates this with user-level location, redacted display, and `0600` permissions, not with encryption.

## Capabilities

### New Capabilities

- `model-configuration`: User-level model profile loading, validation, first-run setup, preset behavior, secure write permissions, and redacted display.
- `llm-run-loop`: Minimal CLI-to-provider-to-renderer loop for real OpenAI-compatible streaming and fixture-backed deterministic execution.

### Modified Capabilities

None.

## Impact

- Affected code: `src/cli`, `src/config`, `src/provider`, `src/agent`, `src/ui`, `src/index.ts`, and tests.
- Dependencies: add `yaml`; continue using Node.js 22, TypeScript, zod, pnpm, and Vitest.
- CLI behavior: `kai` and `kai run` become real entrypoints instead of scaffold messages.
- Data/security: model config is written outside the repository at `~/.kai-code-agent/config.yaml`; API keys must be redacted in display paths and never stored in repo fixtures.
- Testing: fixture provider and temporary config paths support deterministic unit and CLI smoke tests without network or real API keys.
