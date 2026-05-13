import type { Message } from "../agent/messages.js";

export interface ProviderInput {
  messages: Message[];
  model: string;
}

export type ProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "done" };

export interface ProviderAdapter {
  stream(input: ProviderInput, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}

export interface ProviderErrorOptions {
  status?: number;
  body?: string;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly status?: number;
  readonly body?: string;

  constructor(message: string, options: ProviderErrorOptions = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = options.status;
    this.body = options.body;
    this.cause = options.cause;
  }
}
