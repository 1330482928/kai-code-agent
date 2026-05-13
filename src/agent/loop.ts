import type { Message, RunResult } from "./messages.js";
import type { ProviderAdapter, ProviderEvent } from "../provider/types.js";

export interface RunOnceOptions {
  task: string;
  model: string;
  provider: ProviderAdapter;
  signal?: AbortSignal;
  onEvent?: (event: ProviderEvent) => void | Promise<void>;
}

export async function runOnce(options: RunOnceOptions): Promise<RunResult> {
  const controller = options.signal ? null : new AbortController();
  const signal = options.signal ?? controller?.signal;
  if (!signal) {
    throw new Error("failed to create abort signal");
  }

  const userMessage: Message = {
    role: "user",
    content: options.task,
  };
  const messages: Message[] = [userMessage];
  let assistantText = "";
  let usage: RunResult["usage"];

  for await (const event of options.provider.stream(
    { messages: [...messages], model: options.model },
    signal,
  )) {
    if (event.type === "text_delta") {
      assistantText += event.text;
    } else if (event.type === "usage") {
      usage = {
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
      };
    }

    await options.onEvent?.(event);
    if (event.type === "done") {
      break;
    }
  }

  const assistantMessage: Message = {
    role: "assistant",
    content: assistantText,
  };
  messages.push(assistantMessage);

  return {
    messages,
    assistantMessage,
    usage,
  };
}
