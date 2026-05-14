export function redactContextTraceText(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-********")
    .replace(/\b(api[_-]?key|apikey|token|secret)(\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1$2********")
    .replace(/\/Users\/[^"'`\s]+/g, "[redacted-path]")
    .replace(/\/var\/folders\/[^"'`\s]+/g, "[redacted-path]");
}

export function redactContextTraceValue<T>(value: T): T {
  if (typeof value === "string") {
    return redactContextTraceText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactContextTraceValue(item)) as T;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactContextTraceValue(item)] as const);
    return Object.fromEntries(entries) as T;
  }
  return value;
}
