import { describe, expect, it } from "vitest";

import { main } from "../src/index.js";

describe("project scaffold", () => {
  it("exports the CLI entrypoint", () => {
    expect(typeof main).toBe("function");
  });
});

