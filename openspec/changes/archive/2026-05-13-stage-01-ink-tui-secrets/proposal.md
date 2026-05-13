## Why

Stage 01 proves the real model loop, but the current readline-style interaction is visually rough and exposes API keys while the user types them. Before moving to the next roadmap stage, Kai should polish the first-run and one-turn interaction enough that local manual testing feels safe and deliberate.

## What Changes

### Scope

- Replace the current plain readline prompts for first-run setup and bare `kai` task entry with an Ink-based terminal UI.
- Show a compact setup flow with preset selection, model name entry, masked API key entry, and a final confirmation state.
- Mask API key input as `************` or equivalent bullets while typing.
- Keep `kai config show` redacted and make redaction visually consistent with the TUI.
- Keep non-interactive `kai run "<task>"` and fixture replay behavior stable.
- Add tests for secret masking behavior and CLI fallback paths where full TUI rendering is not practical in CI.

### Non-goals

- No Stage 02 tool calls, file editing tools, Bash tool, session persistence, or permission system.
- No full-screen dashboard, chat history panel, command palette, or multi-turn TUI.
- No platform keychain integration.
- No replacement of the real API key in config with literal asterisks; masked text is display-only.

### Secret handling boundary

This change treats `************` as terminal display masking, not irreversible encryption. The API key still needs to be available to the provider adapter after configuration, so replacing it with literal asterisks would break real model calls. Local at-rest encryption can be proposed separately if we choose a key source, migration strategy, and recovery behavior.

### Risks

- Ink introduces React-style rendering dependencies and can complicate tests; keep TUI components small and isolate pure state transitions.
- Masked input may behave differently across terminals; provide a basic non-interactive or injected-IO fallback for automated tests.
- Adding a richer first-run UI can accidentally pull in future product scope; keep this change limited to Stage 01 setup and task entry.

## Capabilities

### New Capabilities

- `ink-terminal-ui`: Ink-based first-run setup and bare `kai` one-turn task entry for Stage 01.
- `secret-masking`: API key masking and redaction behavior across setup input and config display.

### Modified Capabilities

None.

## Impact

- Affected code: `src/cli`, `src/config`, new or updated `src/ui` modules, tests, and package metadata.
- Dependencies: add Ink-related runtime dependencies such as `ink`, `react`, and a minimal text input/select helper if needed.
- CLI behavior: `kai` without arguments becomes a small TUI flow; `kai run "<task>"`, fixture replay, and provider execution remain command-line friendly.
- Security posture: improves terminal exposure risk by masking API key input; does not claim encrypted storage.
- Testing: add focused component/state tests and smoke tests that verify masking/redaction without requiring a real terminal.
