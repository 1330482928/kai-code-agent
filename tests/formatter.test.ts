import { describe, expect, it } from "vitest";

import { formatToolResultForModel, type ToolResult } from "../src/index.js";

describe("tool result formatter", () => {
  it("formats structured failures for the model", () => {
    const formatted = formatToolResultForModel("read_file", {
      ok: false,
      output: "missing",
      error: { kind: "not_found", message: "missing" },
    });

    expect(JSON.parse(formatted)).toMatchObject({
      ok: false,
      error: { kind: "not_found", message: "missing" },
    });
  });

  it("formats bash metadata without full raw output", () => {
    const formatted = formatToolResultForModel("bash", {
      ok: true,
      output: "raw",
      metadata: {
        bash: {
          command: "pwd",
          exitCode: 0,
          interrupted: false,
          stdoutPreview: "/tmp/project\n",
          stderrPreview: "",
          outputBytes: 13,
        },
      },
    });

    expect(JSON.parse(formatted)).toMatchObject({
      command: "pwd",
      exitCode: 0,
      stdoutPreview: "/tmp/project\n",
      outputBytes: 13,
    });
  });

  it("formats edit summaries and truncates large fallback output", () => {
    const edit = formatToolResultForModel("edit_file", {
      ok: true,
      output: "edited",
      metadata: {
        path: "a.txt",
        replacements: 1,
        diff: "-old\n+new",
      },
    });
    expect(JSON.parse(edit)).toMatchObject({
      path: "a.txt",
      replacements: 1,
      diff: "-old\n+new",
    });

    const huge: ToolResult = {
      ok: true,
      output: "x".repeat(7000),
    };
    expect(formatToolResultForModel("unknown", huge)).toContain("[truncated");
  });
});
