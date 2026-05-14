import type { JsonObject, JsonValue } from "../foundation/tool.js";

export function mergeSettings(base: JsonObject, override: JsonObject, path: string[] = []): JsonObject {
  const merged: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const previous = merged[key];
    merged[key] = mergeSettingValue(previous, value, [...path, key]);
  }
  return merged;
}

function mergeSettingValue(previous: JsonValue | undefined, value: JsonValue, path: string[]): JsonValue {
  if (isJsonObject(previous) && isJsonObject(value)) {
    return mergeSettings(previous, value, path);
  }

  if (Array.isArray(previous) && Array.isArray(value) && shouldUnion(path)) {
    return unionValues(previous, value);
  }

  return value;
}

function shouldUnion(path: string[]): boolean {
  const leaf = path[path.length - 1] ?? "";
  return leaf === "allow" || leaf === "allowed" || leaf === "allowedTools" || leaf === "permissions" || leaf === "deny" || leaf === "denied" || leaf === "deniedTools" || leaf === "reject" || leaf === "rejected";
}

function unionValues(a: JsonValue[], b: JsonValue[]): JsonValue[] {
  const seen = new Set<string>();
  const result: JsonValue[] = [];
  for (const item of [...a, ...b]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function isJsonObject(value: JsonValue | unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

