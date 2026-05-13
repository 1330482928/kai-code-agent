import type { ProviderEvent } from "../provider/types.js";
import type { ProviderAdapter } from "../provider/types.js";
import { runReactLoop } from "./react-loop.js";
import type { RunResult } from "./messages.js";

export interface RunOnceOptions {
  task: string;
  model: string;
  provider: ProviderAdapter;
  signal?: AbortSignal;
  onEvent?: (event: ProviderEvent) => void | Promise<void>;
}

export async function runOnce(options: RunOnceOptions): Promise<RunResult> {
  return runReactLoop({
    task: options.task,
    model: options.model,
    provider: options.provider,
    signal: options.signal,
    onEvent: options.onEvent,
  });
}
