import { describe, expect, it } from "vitest";

import { runOnce, type ProviderAdapter, type ProviderEvent, type ProviderInput } from "../src/index.js";

describe("agent loop", () => {
  it("accumulates assistant text and returns the turn messages", async () => {
    const emitted: ProviderEvent[] = [];
    const provider = new ScriptedProvider([
      { type: "text_delta", text: "Hel" },
      { type: "usage", inputTokens: 4, outputTokens: 2 },
      { type: "text_delta", text: "lo" },
      { type: "done" },
    ]);

    const result = await runOnce({
      task: "hello",
      model: "test-model",
      provider,
      onEvent(event) {
        emitted.push(event);
      },
    });

    expect(provider.lastInput?.model).toBe("test-model");
    expect(provider.lastInput?.messages.some((message) => message.role === "system")).toBe(true);
    expect(provider.lastInput?.messages.some((message) => message.role === "user" && message.content === "hello")).toBe(true);
    expect(result.assistantMessage).toEqual({ role: "assistant", content: "Hello" });
    expect(result.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "Hello" },
    ]);
    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 2 });
    expect(emitted).toEqual([
      { type: "text_delta", text: "Hel" },
      { type: "usage", inputTokens: 4, outputTokens: 2 },
      { type: "text_delta", text: "lo" },
      { type: "done" },
    ]);
  });
});

class ScriptedProvider implements ProviderAdapter {
  lastInput?: ProviderInput;

  constructor(private readonly events: ProviderEvent[]) {}

  async *stream(input: ProviderInput): AsyncIterable<ProviderEvent> {
    this.lastInput = input;
    for (const event of this.events) {
      yield event;
    }
  }
}
