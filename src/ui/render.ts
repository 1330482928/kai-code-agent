import { ProviderError, type ProviderEvent } from "../provider/types.js";

export interface RendererStreams {
  stdout: Pick<NodeJS.WritableStream, "write">;
  stderr: Pick<NodeJS.WritableStream, "write">;
}

export function renderProviderEvent(
  event: ProviderEvent,
  stdout: Pick<NodeJS.WritableStream, "write"> = process.stdout,
): void {
  if (event.type === "text_delta") {
    stdout.write(event.text);
  }
}

export function renderError(
  error: unknown,
  stderr: Pick<NodeJS.WritableStream, "write"> = process.stderr,
): void {
  stderr.write(`${formatError(error)}\n`);
}

export function formatError(error: unknown): string {
  if (error instanceof ProviderError) {
    const status = error.status ? ` (${error.status})` : "";
    return `Provider error${status}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
