## 1. Runtime and Foundation Protocol

- [x] 1.1 Add or adjust package metadata, TypeScript typings, and test configuration needed for Stage 02 Bun APIs and validation commands.
- [x] 1.2 Create `src/foundation/tool.ts` with zod-backed `ToolDef`, `ToolResult.ok`, `ToolError`, `ToolContext.signal`, `ToolContext.sessionId`, provider raw tool call types, executable tool use types, provider schema metadata, result format policy types, runtime events, and JSON-safe metadata types.
- [x] 1.3 Decide whether existing `src/tools/*` files should be removed or retained as compatibility re-exports, then update exports consistently.
- [x] 1.4 Export the foundation tool protocol from `src/index.ts`.

## 2. Coding Tool Registry and Runner

- [x] 2.1 Create `src/coding/tools/registry.ts` with default built-in registration, lookup by tool name, enabled tool listing, and provider schema conversion.
- [x] 2.2 Create `src/coding/tools/runner.ts` to validate inputs, handle unknown tools, catch tool exceptions, and normalize failures into `ToolResult`.
- [x] 2.3 Add `src/coding/tools/index.ts` exporting the registry, runner, and built-in coding tools.
- [x] 2.4 Add unit tests for registry listing, provider schema conversion, runner validation, unknown tools, and exception normalization.

## 3. File Tools

- [x] 3.1 Implement shared path helpers that resolve tool paths against cwd and reject paths outside cwd.
- [x] 3.2 Implement `read_file` in `src/coding/tools/read.ts` using `Bun.file`, with bounded output, missing-file errors, directory errors, and relative-path metadata.
- [x] 3.3 Implement `write_file` in `src/coding/tools/write.ts` using `Bun.write`, with cwd-contained parent directory creation, byte-count metadata, and outside-cwd rejection.
- [x] 3.4 Implement `edit_file` in `src/coding/tools/edit.ts` with exact `oldString`/`newString` replacement, unique-match enforcement, `replaceAll`, replacement counts, and unchanged-file failures.
- [x] 3.5 Add unit tests for `read_file`, `write_file`, and `edit_file` using temporary cwd directories.

## 4. Bash Tool

- [x] 4.1 Implement `bash` in `src/coding/tools/bash.ts` with input validation for `command`, optional `timeout`, and optional `description`.
- [x] 4.2 Execute foreground commands with `Bun.spawn`, cwd, abort/timeout handling, and process cleanup.
- [x] 4.3 Capture bounded stdout/stderr previews, output byte counts, `exitCode`, `interrupted`, and `metadata.bash`.
- [x] 4.4 Add tests for success, non-zero exit, timeout, and large-output preview behavior.

## 5. Provider Tool Calling

- [x] 5.1 Extend `Message`, `ProviderInput`, and `ProviderEvent` to represent provider-neutral tool schemas, assistant tool calls, and tool result messages.
- [x] 5.2 Update the OpenAI-compatible provider to serialize `tools`, assistant `tool_calls`, and role `tool` result messages.
- [x] 5.3 Update provider parsing to normalize only complete provider raw tool calls into executable `tool_call` events with parsed JSON object input.
- [x] 5.4 Explicitly handle malformed complete tool arguments as provider errors and leave partial streamed argument accumulation out of Stage 02.
- [x] 5.5 Add provider tests for tool schema serialization, formatted tool result serialization, complete tool-call parsing, malformed tool arguments, and partial argument non-dispatch behavior.

## 6. Tool Result Formatter

- [x] 6.1 Implement `src/agent/tool-result-formatter.ts` with `formatToolResultForModel(toolName, rawResult)` and default fallback formatting.
- [x] 6.2 Add initial format policies for `read_file`, `write_file`, `edit_file`, `bash`, and unknown/error results.
- [x] 6.3 Ensure formatted failures expose `ok:false`, `error.kind`, and a concise message while bounding details.
- [x] 6.4 Add formatter tests for success, structured failure, bash preview, edit summary, and truncation behavior.

## 7. Generic ReAct Loop and CLI

- [x] 7.1 Implement `src/agent/react-loop.ts` to send enabled tools, execute requested executable tool uses serially through the registry/runner, format raw tool results, append assistant tool-call and formatted tool-result messages, and continue provider calls until final assistant text.
- [x] 7.2 Preserve the existing text-only behavior through `runOnce()` compatibility or a thin wrapper over the ReAct loop.
- [x] 7.3 Wire `kai run` and bare `kai` task submission to the ReAct loop with the default coding tool registry.
- [x] 7.4 Ensure provider errors still render concise CLI messages and tool failures are returned to the model instead of terminating the process.

## 8. Fixture Provider and Demo Fixtures

- [x] 8.1 Extend fixture schemas to support complete executable `tool_call` events and staged provider responses across multiple `stream()` invocations.
- [x] 8.2 Add a read-file fixture demo under `fixtures/provider/read-file.json` that requests `read_file` and then returns final assistant text.
- [x] 8.3 Add a bash fixture demo under `fixtures/provider/bash.json` that requests `bash` and then returns final assistant text.
- [x] 8.4 Add CLI smoke tests proving fixture ReAct loops run without a real API key or network access.

## 9. Validation

- [x] 9.1 Run `bun run kai run --provider fixture --script fixtures/provider/read-file.json "read package"`.
- [x] 9.2 Run `bun run kai run --provider fixture --script fixtures/provider/bash.json "run pwd"`.
- [x] 9.3 Run `bun test -- stage-02`.
- [x] 9.4 Run the repository's existing typecheck command or the Bun-aligned replacement selected in task 1.1.
