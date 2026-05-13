import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { ProviderAdapter, ProviderEvent, ProviderInput } from "./types.js";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const jsonObjectSchema = z.record(jsonValueSchema);

export const fixtureProviderEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text_delta"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("thinking_delta"),
    text: z.string(),
    hidden: z.literal(true),
  }),
  z.object({
    type: z.literal("tool_call"),
    toolCall: z.object({
      id: z.string(),
      name: z.string(),
      input: jsonObjectSchema,
    }),
  }),
  z.object({
    type: z.literal("tool_call_delta"),
    id: z.string(),
    name: z.string().optional(),
    argumentsDelta: z.string().optional(),
    final: z.boolean().optional(),
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

const fixtureResponseSchema = z.object({
  events: z.array(fixtureProviderEventSchema),
});

const fixtureScriptSchema = z.union([
  z.array(fixtureProviderEventSchema),
  z.object({
    events: z.array(fixtureProviderEventSchema),
  }),
  z.object({
    responses: z.array(fixtureResponseSchema),
  }),
]);

export class FixtureProvider implements ProviderAdapter {
  readonly inputs: ProviderInput[] = [];
  private readonly responses: ProviderEvent[][];
  private callIndex = 0;

  constructor(eventsOrResponses: ProviderEvent[] | ProviderEvent[][]) {
    this.responses = Array.isArray(eventsOrResponses[0])
      ? eventsOrResponses as ProviderEvent[][]
      : [eventsOrResponses as ProviderEvent[]];
  }

  static async fromFile(filePath: string): Promise<FixtureProvider> {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    const script = fixtureScriptSchema.parse(parsed);
    if (Array.isArray(script)) {
      return new FixtureProvider(script as ProviderEvent[]);
    }
    if ("responses" in script) {
      return new FixtureProvider(script.responses.map((response) => response.events as ProviderEvent[]));
    }
    return new FixtureProvider(script.events as ProviderEvent[]);
  }

  async *stream(input: ProviderInput, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    this.inputs.push(input);
    const events = this.responses[this.callIndex] ?? [];
    this.callIndex += 1;

    for (const event of events) {
      if (signal.aborted) {
        return;
      }
      yield event;
    }
  }
}
