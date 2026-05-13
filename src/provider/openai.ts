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
        messages: input.messages,
        stream: true,
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
        yield { type: "done" };
        continue;
      }
      for (const providerEvent of parseOpenAIChunk(event)) {
        yield providerEvent;
      }
    }
  }

  buffer += decoder.decode();
  const tail = parseSseLine(buffer);
  if (tail && tail !== "[DONE]") {
    for (const providerEvent of parseOpenAIChunk(tail)) {
      yield providerEvent;
    }
  } else if (tail === "[DONE]") {
    completed = true;
    yield { type: "done" };
  }

  if (!completed) {
    yield { type: "done" };
  }
}

export function parseOpenAIChunk(serialized: string): ProviderEvent[] {
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
      const delta = isRecord(choice) ? choice["delta"] : undefined;
      const content = isRecord(delta) ? delta["content"] : undefined;
      if (typeof content === "string" && content.length > 0) {
        events.push({ type: "text_delta", text: content });
      }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
