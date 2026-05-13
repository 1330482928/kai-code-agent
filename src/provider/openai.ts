import type { Message } from "../foundation/message.js";
import {
  StreamingReasoningSplitter,
  splitReasoningParts,
  type ReasoningPart,
} from "../agent/reasoning-splitter.js";
import {
  parseExecutableToolUse,
  type ProviderToolSchema,
  type ProviderRawToolCall,
} from "../foundation/tool.js";
import { ProviderError, type ProviderAdapter, type ProviderEvent, type ProviderInput } from "./types.js";

export interface OpenAIProviderOptions {
  baseURL: string;
  apiKey: string;
  fetch?: typeof fetch;
}

export class OpenAIProvider implements ProviderAdapter {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIProviderOptions) {
    this.baseURL = options.baseURL.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async *stream(input: ProviderInput, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    const response = await this.fetchImpl(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "accept": "text/event-stream",
        "authorization": `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: serializeMessages(input.messages),
        stream: true,
        ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
      }),
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ProviderError(`Provider request failed with status ${response.status}`, {
        status: response.status,
        body,
      });
    }

    if (!response.body) {
      throw new ProviderError("Provider response did not include a stream body");
    }

    yield* parseOpenAIStream(response.body as AsyncIterable<Uint8Array>);
  }
}

export async function* parseOpenAIStream(
  body: AsyncIterable<Uint8Array>,
): AsyncIterable<ProviderEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  const state = createOpenAIChunkState();

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseSseLine(line);
      if (!event) {
        continue;
      }
      if (event === "[DONE]") {
        completed = true;
        for (const providerEvent of flushReasoningState(state)) {
          yield providerEvent;
        }
        yield { type: "done" };
        continue;
      }
      for (const providerEvent of parseOpenAIChunk(event, state)) {
        yield providerEvent;
      }
    }
  }

  buffer += decoder.decode();
  const tail = parseSseLine(buffer);
  if (tail && tail !== "[DONE]") {
    for (const providerEvent of parseOpenAIChunk(tail, state)) {
      yield providerEvent;
    }
  } else if (tail === "[DONE]") {
    completed = true;
    for (const providerEvent of flushReasoningState(state)) {
      yield providerEvent;
    }
    yield { type: "done" };
  }

  if (!completed) {
    for (const providerEvent of flushReasoningState(state)) {
      yield providerEvent;
    }
    yield { type: "done" };
  }
}

export interface OpenAIChunkState {
  toolCallIdsByIndex: Map<number, string>;
  reasoningSplitter: StreamingReasoningSplitter;
}

export function createOpenAIChunkState(): OpenAIChunkState {
  return {
    toolCallIdsByIndex: new Map(),
    reasoningSplitter: new StreamingReasoningSplitter(),
  };
}

export function parseOpenAIChunk(serialized: string, state?: OpenAIChunkState): ProviderEvent[] {
  const chunkState = state ?? createOpenAIChunkState();
  let payload: unknown;
  try {
    payload = JSON.parse(serialized);
  } catch (error) {
    throw new ProviderError("Provider returned malformed streaming JSON", { cause: error });
  }

  if (!isRecord(payload)) {
    throw new ProviderError("Provider returned a non-object streaming payload");
  }

  const events: ProviderEvent[] = [];
  const usage = payload["usage"];
  if (isRecord(usage)) {
    const inputTokens = numberField(usage, "prompt_tokens");
    const outputTokens = numberField(usage, "completion_tokens");
    events.push({ type: "usage", inputTokens, outputTokens });
  }

  const choices = payload["choices"];
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!isRecord(choice)) {
        continue;
      }
      const message = choice["message"];
      if (isRecord(message)) {
        events.push(...eventsFromCompleteMessage(message));
      }

      const delta = choice["delta"];
      if (isRecord(delta)) {
        events.push(...eventsFromDelta(delta, chunkState));
      }
    }
  }

  return events;
}

export function serializeMessages(messages: Message[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId ?? "",
        name: message.name ?? "",
        content: message.content,
      };
    }

    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: message.content.length > 0 ? message.content : null,
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.input),
          },
        })),
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

export function serializeTools(tools: ProviderToolSchema[]): ProviderToolSchema[] {
  return tools;
}

function eventsFromCompleteMessage(message: Record<string, unknown>): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  const content = message["content"];
  if (typeof content === "string" && content.length > 0) {
    events.push(...splitTextAndThinking(content));
  }
  events.push(...nativeReasoningEvents(message));
  events.push(...toolCallsFromUnknown(message["tool_calls"], false));
  return events;
}

function eventsFromDelta(delta: Record<string, unknown>, state?: OpenAIChunkState): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  const content = delta["content"];
  if (typeof content === "string" && content.length > 0) {
    events.push(...eventsFromReasoningParts(state?.reasoningSplitter.push(content) ?? splitReasoningParts(content)));
  }
  events.push(...nativeReasoningEvents(delta));
  events.push(...toolCallsFromUnknown(delta["tool_calls"], true, state));
  return events;
}

function toolCallsFromUnknown(value: unknown, allowPartial: boolean, state?: OpenAIChunkState): ProviderEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const events: ProviderEvent[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const index = numberField(item, "index");
    const explicitId = stringField(item, "id");
    if (allowPartial && explicitId && index !== undefined) {
      state?.toolCallIdsByIndex.set(index, explicitId);
    }
    const id = explicitId ?? (index === undefined ? undefined : state?.toolCallIdsByIndex.get(index) ?? `tool-${index}`);
    const fn = item["function"];
    const name = isRecord(fn) ? stringField(fn, "name") : undefined;
    const args = isRecord(fn) ? stringField(fn, "arguments") : undefined;
    if (!id) {
      continue;
    }

    if (allowPartial) {
      events.push({
        type: "tool_call_delta",
        id,
        ...(name ? { name } : {}),
        ...(args === undefined ? {} : { argumentsDelta: args }),
      });
      continue;
    }

    if (!name || args === undefined) {
      continue;
    }

    const raw: ProviderRawToolCall = { id, name, arguments: args };
    try {
      events.push({ type: "tool_call", toolCall: parseExecutableToolUse(raw) });
    } catch (error) {
      if (allowPartial) {
        continue;
      }
      throw new ProviderError(error instanceof Error ? error.message : String(error), { cause: error });
    }
  }
  return events;
}

function splitTextAndThinking(text: string): ProviderEvent[] {
  return eventsFromReasoningParts(splitReasoningParts(text));
}

function flushReasoningState(state: OpenAIChunkState): ProviderEvent[] {
  return eventsFromReasoningParts(state.reasoningSplitter.flush());
}

function eventsFromReasoningParts(parts: ReasoningPart[]): ProviderEvent[] {
  return parts.map((part) => (
    part.type === "thinking"
      ? { type: "thinking_delta", text: part.text, hidden: true }
      : { type: "text_delta", text: part.text }
  ));
}

function nativeReasoningEvents(record: Record<string, unknown>): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  for (const key of ["reasoning_content", "reasoning", "thinking"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      events.push({ type: "thinking_delta", text: value, hidden: true });
    }
  }
  return events;
}

function parseSseLine(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith(":")) {
    return null;
  }
  if (!trimmed.startsWith("data:")) {
    return null;
  }
  return trimmed.slice("data:".length).trim();
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
