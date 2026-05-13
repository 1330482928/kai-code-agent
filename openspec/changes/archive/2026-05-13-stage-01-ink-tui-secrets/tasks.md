## 1. Dependencies and Structure

- [x] 1.1 Add Ink-related dependencies (`ink`, `react`, and minimal input/select helpers if chosen) and update the lockfile.
- [x] 1.2 Create TUI module structure under `src/ui` for setup flow, task entry, secret masking, and testable state helpers.
- [x] 1.3 Keep existing plain renderer modules available for command-mode output and provider streaming.

## 2. Secret Masking

- [x] 2.1 Add a reusable secret masking helper that returns `************` for non-empty API keys.
- [x] 2.2 Update `kai config show` formatting to display `API key: ************` without printing the stored key.
- [x] 2.3 Ensure setup saves the real API key value and never writes literal mask characters as the credential.
- [x] 2.4 Add tests proving raw API key strings do not appear in captured setup/config output.

## 3. Ink Setup Flow

- [x] 3.1 Implement a testable setup state model for preset selection, API key entry, model entry, custom provider/baseURL entry, and confirmation.
- [x] 3.2 Implement the Ink setup component for missing-config first-run setup.
- [x] 3.3 Mask API key input while typing and pasting in the Ink setup component.
- [x] 3.4 Wire setup completion to the existing Stage 01 `ModelConfig` schema and save path.
- [x] 3.5 Preserve injected prompt or non-TTY fallback behavior for tests and automation.

## 4. Ink Task Entry Flow

- [x] 4.1 Implement an Ink task entry component for bare `kai` when config already exists.
- [x] 4.2 Wire task submission to the existing `runOnce()` provider loop.
- [x] 4.3 Keep streamed assistant responses readable after task submission.
- [x] 4.4 Ensure empty task submissions remain rejected with a clear user-facing message.

## 5. Command Compatibility

- [x] 5.1 Verify `kai run "<task>"` does not render the Ink setup/task TUI when config exists.
- [x] 5.2 Verify `kai run --provider fixture --script <path> "<task>"` remains deterministic and stdout-friendly.
- [x] 5.3 Verify `kai config show` remains plain text and script-friendly.

## 6. Tests and Validation

- [x] 6.1 Add unit tests for setup state transitions and config assembly.
- [x] 6.2 Add unit tests for secret masking and redaction.
- [x] 6.3 Add CLI smoke tests for command compatibility and non-TTY fallback behavior.
- [x] 6.4 Run `pnpm typecheck`.
- [x] 6.5 Run `pnpm test`.
- [x] 6.6 Manually run `pnpm kai` and verify first-run setup uses Ink and masks the API key.
- [x] 6.7 Manually run `pnpm kai run --provider fixture --script fixtures/provider/basic-text.json "hello"` and verify output remains plain.
