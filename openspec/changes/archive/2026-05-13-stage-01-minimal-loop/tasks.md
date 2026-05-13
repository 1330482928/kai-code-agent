## 1. Project Setup

- [x] 1.1 Add the `yaml` dependency and update package metadata or lockfile as needed.
- [x] 1.2 Create Stage 01 module files under `src/config`, `src/provider`, `src/agent`, and `src/ui`.
- [x] 1.3 Export the public Stage 01 types and CLI entrypoint from `src/index.ts`.

## 2. Model Configuration

- [x] 2.1 Define zod schemas and TypeScript types for `ModelConfig`, `ModelProfile`, and provider presets.
- [x] 2.2 Implement default config path resolution for `~/.kai-code-agent/config.yaml` with test path injection.
- [x] 2.3 Implement YAML config load, validation, and missing-config detection.
- [x] 2.4 Implement YAML config save with parent directory creation and `0600` file permissions where supported.
- [x] 2.5 Implement the first-run wizard for `Minimax Global` and `Other` presets.
- [x] 2.6 Implement `kai config show` output with API key redaction.

## 3. Provider Layer

- [x] 3.1 Define `Message`, `ProviderInput`, `ProviderEvent`, `ProviderAdapter`, and provider error contracts.
- [x] 3.2 Implement provider factory creation from the selected model profile.
- [x] 3.3 Implement the OpenAI-compatible streaming adapter using `{baseURL}/chat/completions`.
- [x] 3.4 Implement streaming chunk parsing for text deltas, usage events, completion, and malformed payload errors.
- [x] 3.5 Implement the fixture provider and fixture event schema validation.
- [x] 3.6 Add a basic fixture script at `fixtures/provider/basic-text.json`.

## 4. Agent Loop and CLI

- [x] 4.1 Implement `runOnce()` to build user/assistant messages, consume provider events, and return the turn result.
- [x] 4.2 Implement the renderer for text deltas and concise provider error summaries.
- [x] 4.3 Replace scaffold CLI behavior with `kai`, `kai run "<task>"`, and `kai config show`.
- [x] 4.4 Implement fixture CLI flags for `kai run --provider fixture --script <path> "<task>"`.
- [x] 4.5 Ensure Stage 01 runs do not create session transcripts, tool result files, or workspace mutations.

## 5. Tests

- [x] 5.1 Add config tests for valid load, missing default profile, wizard result assembly, redacted display, and secure save permissions.
- [x] 5.2 Add provider tests for OpenAI-compatible stream parsing, provider error handling, and fixture replay.
- [x] 5.3 Add agent loop tests for accumulated assistant messages and done handling.
- [x] 5.4 Add CLI smoke tests using temporary config paths and fixture provider replay.
- [x] 5.5 Update existing scaffold smoke tests to assert Stage 01 behavior instead of scaffold output.

## 6. Validation

- [x] 6.1 Run `pnpm typecheck`.
- [x] 6.2 Run `pnpm test`.
- [x] 6.3 Run `pnpm kai run --provider fixture --script fixtures/provider/basic-text.json "hello"` or the package-equivalent command.
- [x] 6.4 Manually verify `kai config show` redacts API keys when a temporary config is present.
