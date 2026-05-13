import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { ProviderAdapter, ProviderEvent, ProviderInput } from "./types.js";

export const fixtureProviderEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text_delta"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("usage"),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
  }),
  z.object({
    type: z.literal("done"),
  }),
]);

const fixtureScriptSchema = z.union([
  z.array(fixtureProviderEventSchema),
  z.object({
    events: z.array(fixtureProviderEventSchema),
  }),
]);

export class FixtureProvider implements ProviderAdapter {
  private readonly events: ProviderEvent[];

  constructor(events: ProviderEvent[]) {
    this.events = events;
  }

  static async fromFile(filePath: string): Promise<FixtureProvider> {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    const script = fixtureScriptSchema.parse(parsed);
    return new FixtureProvider(Array.isArray(script) ? script : script.events);
  }

  async *stream(_input: ProviderInput, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    for (const event of this.events) {
      if (signal.aborted) {
        return;
      }
      yield event;
    }
  }
}
