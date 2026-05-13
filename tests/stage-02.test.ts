import { describe, expect, it } from "vitest";

import {
  createDefaultToolRegistry,
  formatToolResultForModel,
} from "../src/index.js";

describe("stage-02", () => {
  it("exposes the core coding tool pack and model-visible formatter", () => {
    const registry = createDefaultToolRegistry();

    expect(registry.list().map((tool) => tool.name)).toEqual([
      "read_file",
      "write_file",
      "edit_file",
      "bash",
      "ask_user_question",
    ]);
    expect(formatToolResultForModel("write_file", {
      ok: true,
      output: "Wrote 4 bytes to a.txt",
      metadata: { path: "a.txt", bytes: 4 },
    })).toContain("a.txt");
  });
});
