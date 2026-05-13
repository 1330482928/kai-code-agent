## Context

Stage 01 currently uses readline prompts for first-run setup and bare `kai` task entry. That keeps the implementation small, but it exposes API keys while typing and makes the first local experience feel unfinished. This change polishes only the Stage 01 interactive surface before moving into the next roadmap stage.

The implementation must preserve the working Stage 01 contracts: user config remains at `~/.kai-code-agent/config.yaml`, `kai run "<task>"` remains command-friendly, fixture provider replay remains deterministic, and the OpenAI-compatible provider still receives the real API key.

## Goals / Non-Goals

**Goals:**

- Use Ink for the interactive first-run setup flow.
- Use Ink for the bare `kai` one-turn task entry flow.
- Mask API key input while typing and use a fixed mask such as `************` in terminal display.
- Keep `kai config show` from printing raw API keys and make its display consistent with the mask.
- Keep automated tests possible without depending on a real interactive terminal.

**Non-Goals:**

- No full chat TUI, transcript view, scrollback panel, or command palette.
- No Stage 02 tools, Bash execution, file editing, permission UI, or session persistence.
- No literal replacement of the stored API key with `************`.
- No OS keychain or encryption-at-rest migration in this small change.

## Decisions

### Ink owns interactive flows; command flows stay plain

`kai` without arguments and missing-config setup should render an Ink app. `kai run "<task>"`, `kai run --provider fixture`, and other command-style flows should keep plain stdout/stderr behavior so they remain easy to script and test.

Alternative considered: migrate all CLI output to Ink. That would add complexity to fixture runs, tests, and future CI commands without improving the Stage 01 pain point.

### Keep first-run state separate from rendering

The TUI should use a small state model for setup steps:

1. preset selection
2. API key entry
3. model name entry
4. optional custom provider/baseURL fields
5. confirmation

The state transition and config assembly logic should be testable without mounting Ink. Ink components should mostly render current state and dispatch input events.

Alternative considered: put all prompt logic directly inside React components. That is faster initially but makes secret handling and CI testing brittle.

### Masking is display-only, not stored-secret encryption

The UI must never echo the raw API key. While typing, the visible value should be a fixed mask or repeated mask characters. `kai config show` should display `API key: ************`. The saved config must still contain the actual API key string so the provider adapter can authenticate.

This is an explicit tradeoff. Actual encrypted local storage needs a key-management decision: OS keychain, user passphrase, machine-local key, or provider-specific token storage. That deserves a separate security change because it affects migration, recovery, and non-interactive usage.

### Use minimal Ink dependencies

Add `ink` and `react`. For text input and selection, either use small well-maintained Ink helpers or implement minimal local controls with `useInput`; prefer the smallest reliable dependency set that supports masked input cleanly.

Alternative considered: use a heavier TUI framework or full-screen layout. That conflicts with the roadmap's minimal-first rule.

### Preserve test and fallback paths

Tests should cover pure state/config assembly, mask formatting, and command behavior. Where a real TTY is unavailable, CLI options can inject a non-Ink prompt runner or skip interactive rendering while preserving the same resulting config contract.

## Risks / Trade-offs

- Ink rendering can be hard to snapshot reliably -> keep components simple and test state transitions plus selected rendered text.
- Masked input can still expose secrets through shell history if passed as args -> do not accept API keys as command args in this change.
- Display masking may be mistaken for encryption -> docs, naming, and output should use "masked" or "redacted" language, not claim encrypted storage.
- Extra dependencies increase install footprint -> limit this to interactive UI dependencies only.

## Migration Plan

1. Add Ink dependencies and TUI module structure.
2. Introduce reusable mask/redaction helper returning `************`.
3. Move first-run setup through the Ink setup app while keeping existing config schema.
4. Move bare `kai` task entry through the Ink task app.
5. Keep command-mode and fixture-mode behavior stable.
6. Update tests and local validation commands.

Rollback is straightforward: command-mode behavior and config schema remain unchanged, so the TUI can be replaced by the previous prompt runner without migrating user config.

## Open Questions

None blocking. Real encryption-at-rest remains intentionally out of scope for this change.
