import { describe, expect, it } from "vitest";

import {
  createDefaultToolRegistry,
  runReactLoop,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderInput,
} from "../src/index.js";

describe("react loop", () => {
  it("executes a tool call and continues to final assistant text", async () => {
    const provider = new StagedProvider([
      [
        {
          type: "tool_call",
          toolCall: {
            id: "call_read",
            name: "read_file",
            input: { path: "package.json", limit: 100 },
          },
        },
        { type: "done" },
      ],
      [
        { type: "text_delta", text: "done" },
        { type: "done" },
      ],
    ]);

    const result = await runReactLoop({
      task: "read package",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      cwd: process.cwd(),
    });

    expect(result.assistantMessage).toEqual({ role: "assistant", content: "done" });
    expect(provider.inputs).toHaveLength(2);
    expect(provider.inputs[0]?.tools?.map((tool) => tool.function.name)).toContain("read_file");
    expect(provider.inputs[1]?.messages.some((message) => message.role === "tool")).toBe(true);
  });

  it("returns failed tool results to the provider", async () => {
    const provider = new StagedProvider([
      [
        {
          type: "tool_call",
          toolCall: {
            id: "call_missing",
            name: "missing_tool",
            input: {},
          },
        },
        { type: "done" },
      ],
      [
        { type: "text_delta", text: "handled" },
        { type: "done" },
      ],
    ]);

    await runReactLoop({
      task: "missing",
      model: "fixture-model",
      provider,
      toolRegistry: createDefaultToolRegistry(),
      cwd: process.cwd(),
    });

    const toolMessage = provider.inputs[1]?.messages.find((message) => message.role === "tool");
    expect(toolMessage?.content).toContain("\"ok\": false");
    expect(toolMessage?.content).toContain("\"not_found\"");
  });
});

class StagedProvider implements ProviderAdapter {
  readonly inputs: ProviderInput[] = [];
  private index = 0;

  constructor(private readonly responses: ProviderEvent[][]) {}

  async *stream(input: ProviderInput): AsyncIterable<ProviderEvent> {
    this.inputs.push(input);
    const response = this.responses[this.index] ?? [];
    this.index += 1;
    for (const event of response) {
      yield event;
    }
  }
}
