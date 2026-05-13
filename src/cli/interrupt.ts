export interface InterruptBinding {
  signal: AbortSignal;
  cleanup(): void;
}

export function createInterruptBinding(parent?: AbortSignal): InterruptBinding {
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  if (parent) {
    if (parent.aborted) {
      controller.abort();
    } else {
      parent.addEventListener("abort", abort, { once: true });
    }
  }

  const onSigint = () => {
    controller.abort();
  };
  process.once("SIGINT", onSigint);

  return {
    signal: controller.signal,
    cleanup() {
      process.off("SIGINT", onSigint);
      parent?.removeEventListener("abort", abort);
    },
  };
}
