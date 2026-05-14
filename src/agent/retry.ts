import { ProviderError } from "../provider/types.js";
import { isAbortLikeError } from "../coding/tools/errors.js";

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface RetryAttempt {
  attempt: number;
}

export interface RunWithRetryOptions {
  policy?: RetryPolicy;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (input: { error: unknown; attempt: number; nextAttempt: number; delayMs: number }) => void | Promise<void>;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
};

const RETRYABLE_PROVIDER_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export async function runWithRetry<T>(
  operation: (attempt: RetryAttempt) => Promise<T>,
  options: RunWithRetryOptions = {},
): Promise<T> {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const maxAttempts = Math.max(1, policy.maxAttempts);
  let attempt = 1;

  while (true) {
    throwIfRetryAborted(options.signal);
    try {
      return await operation({ attempt });
    } catch (error) {
      throwIfRetryAborted(options.signal);
      const retryable = options.shouldRetry
        ? options.shouldRetry(error, attempt)
        : isRetryableProviderError(error);
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }

      const delayMs = retryDelayMs(policy, attempt);
      await options.onRetry?.({ error, attempt, nextAttempt: attempt + 1, delayMs });
      await (options.sleep ?? sleep)(delayMs, options.signal);
      attempt += 1;
    }
  }
}

export function isRetryableProviderError(error: unknown): boolean {
  if (isAbortLikeError(error)) {
    return false;
  }

  if (error instanceof ProviderError) {
    if (error.status === undefined) {
      return true;
    }
    return RETRYABLE_PROVIDER_STATUSES.has(error.status);
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    return true;
  }

  return true;
}

export function retryDelayMs(policy: RetryPolicy, failedAttempt: number): number {
  const exponent = Math.max(0, failedAttempt - 1);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * (2 ** exponent));
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Operation was aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Operation was aborted", "AbortError"));
    }, { once: true });
  });
}

function throwIfRetryAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Operation was aborted", "AbortError");
  }
}
