import { isJsonObject, type ExecutableToolUse, type JsonObject } from "../foundation/tool.js";

export interface ToolCallDeltaInput {
  id: string;
  name?: string;
  argumentsDelta?: string;
  final?: boolean;
}

export type ToolAssemblyResult =
  | { type: "partial"; id: string }
  | { type: "complete"; toolUse: ExecutableToolUse }
  | { type: "invalid"; id: string; name: string; rawArguments: string; reason: string };

interface PartialToolCall {
  id: string;
  name?: string;
  rawArguments: string;
  complete: boolean;
}

export class ToolAccumulator {
  private readonly partials = new Map<string, PartialToolCall>();

  append(delta: ToolCallDeltaInput): ToolAssemblyResult {
    const current = this.partials.get(delta.id) ?? {
      id: delta.id,
      rawArguments: "",
      complete: false,
    };
    if (delta.name) {
      current.name = delta.name;
    }
    if (delta.argumentsDelta) {
      current.rawArguments += delta.argumentsDelta;
    }
    this.partials.set(delta.id, current);

    const canComplete = current.rawArguments.trim().length > 0 || delta.final === true;
    const parsed = parseToolArguments(current.rawArguments);
    if (canComplete && parsed.ok && current.name) {
      current.complete = true;
      this.partials.delete(delta.id);
      return {
        type: "complete",
        toolUse: {
          id: delta.id,
          name: current.name,
          input: parsed.value,
        },
      };
    }

    if (delta.final) {
      this.partials.delete(delta.id);
      return {
        type: "invalid",
        id: delta.id,
        name: current.name ?? "unknown",
        rawArguments: current.rawArguments,
        reason: parsed.ok
          ? "Tool call finished without a function name"
          : parsed.reason,
      };
    }

    return { type: "partial", id: delta.id };
  }

  finalizePending(): ToolAssemblyResult[] {
    const results: ToolAssemblyResult[] = [];
    for (const partial of this.partials.values()) {
      const parsed = parseToolArguments(partial.rawArguments);
      if (parsed.ok && partial.name) {
        results.push({
          type: "complete",
          toolUse: {
            id: partial.id,
            name: partial.name,
            input: parsed.value,
          },
        });
      } else {
        results.push({
          type: "invalid",
          id: partial.id,
          name: partial.name ?? "unknown",
          rawArguments: partial.rawArguments,
          reason: parsed.ok
            ? "Tool call finished without a function name"
            : parsed.reason,
        });
      }
    }
    this.partials.clear();
    return results;
  }
}

function parseToolArguments(rawArguments: string): { ok: true; value: JsonObject } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = rawArguments.trim().length === 0 ? {} : JSON.parse(rawArguments);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (!isJsonObject(parsed)) {
    return {
      ok: false,
      reason: "Tool arguments must be a JSON object",
    };
  }

  return { ok: true, value: parsed };
}
