import { readFile } from "node:fs/promises";

import { z } from "zod";

import { ProviderError } from "./types.js";
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

const fixtureFailureEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  status: z.number().int().optional(),
  body: z.string().optional(),
});

const fixtureStreamItemSchema = z.union([fixtureProviderEventSchema, fixtureFailureEventSchema]);

const fixtureResponseSchema = z.object({
  events: z.array(fixtureStreamItemSchema),
});

const fixtureScriptSchema = z.union([
  z.array(fixtureStreamItemSchema),
  z.object({
    events: z.array(fixtureStreamItemSchema),
  }),
  z.object({
    responses: z.array(fixtureResponseSchema),
  }),
]);

type FixtureStreamItem = z.infer<typeof fixtureStreamItemSchema>;

export class FixtureProvider implements ProviderAdapter {
  readonly inputs: ProviderInput[] = [];
  private readonly responses: FixtureStreamItem[][];
  private callIndex = 0;

  constructor(eventsOrResponses: FixtureStreamItem[] | FixtureStreamItem[][]) {
    this.responses = Array.isArray(eventsOrResponses[0])
      ? eventsOrResponses as FixtureStreamItem[][]
      : [eventsOrResponses as FixtureStreamItem[]];
  }

  static async fromFile(filePath: string): Promise<FixtureProvider> {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    const script = fixtureScriptSchema.parse(parsed);
    if (Array.isArray(script)) {
      return new FixtureProvider(script as FixtureStreamItem[]);
    }
    if ("responses" in script) {
      return new FixtureProvider(script.responses.map((response) => response.events as FixtureStreamItem[]));
    }
    return new FixtureProvider(script.events as FixtureStreamItem[]);
  }

  async *stream(input: ProviderInput, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    this.inputs.push(input);
    const events = this.responses[this.callIndex] ?? [];
    this.callIndex += 1;

    for (const event of events) {
      if (signal.aborted) {
        return;
      }
      if (event.type === "error") {
        throw new ProviderError(event.message, {
          ...(event.status === undefined ? {} : { status: event.status }),
          ...(event.body === undefined ? {} : { body: event.body }),
        });
      }
      yield event as ProviderEvent;
    }
  }
}
