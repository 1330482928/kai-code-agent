import { ProviderError } from "../../provider/types.js";
import type { JsonObject, JsonValue, ToolErrorKind } from "../../foundation/tool.js";

const PREVIEW_CHARS = 600;

export interface NormalizedError {
  kind: ToolErrorKind;
  message: string;
  details?: JsonValue;
}

export function normalizeError(error: unknown, fallbackKind: ToolErrorKind = "execution"): NormalizedError {
  if (isAbortLikeError(error)) {
    return {
      kind: "interrupted",
      message: "Operation was interrupted",
    };
  }

  if (error instanceof ProviderError) {
    return {
      kind: "execution",
      message: providerErrorMessage(error),
      details: providerErrorDetails(error),
    };
  }

  if (error instanceof Error) {
    return {
      kind: fallbackKind,
      message: error.message,
    };
  }

  return {
    kind: fallbackKind,
    message: String(error),
  };
}

export function isAbortLikeError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  if (candidate.name === "AbortError" || candidate.code === "ABORT_ERR") {
    return true;
  }
  return typeof candidate.message === "string" && /\babort(?:ed)?\b/i.test(candidate.message);
}

export function providerErrorMessage(error: ProviderError): string {
  const status = error.status ? ` (${error.status})` : "";
  return `Provider error${status}: ${error.message}`;
}

function providerErrorDetails(error: ProviderError): JsonObject {
  return {
    ...(error.status === undefined ? {} : { status: error.status }),
    ...(error.body ? { bodyPreview: preview(error.body) } : {}),
  };
}

function preview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= PREVIEW_CHARS ? compact : `${compact.slice(0, PREVIEW_CHARS - 3)}...`;
}
