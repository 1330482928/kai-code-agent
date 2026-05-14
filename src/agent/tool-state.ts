import type { ExecutableToolUse } from "../foundation/tool.js";
import type { ToolUseSummary } from "../foundation/tool-summary.js";

export type ToolStatus = "running" | "completed" | "failed" | "interrupted" | "backfilled";

export interface ToolStateEntry {
  id: string;
  name: string;
  summary: ToolUseSummary;
  status: ToolStatus;
  ok?: boolean;
  resultSummary?: string;
  recovered?: boolean;
}

export class ToolState {
  private readonly entries = new Map<string, ToolStateEntry>();

  start(toolUse: ExecutableToolUse, summary: ToolUseSummary): ToolStateEntry {
    const entry: ToolStateEntry = {
      id: toolUse.id,
      name: toolUse.name,
      summary,
      status: "running",
    };
    this.entries.set(toolUse.id, entry);
    return entry;
  }

  finish(id: string, ok: boolean, resultSummary: string, options: { recovered?: boolean; interrupted?: boolean } = {}): ToolStateEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry) {
      return undefined;
    }
    const updated: ToolStateEntry = {
      ...entry,
      status: options.recovered ? "backfilled" : options.interrupted ? "interrupted" : ok ? "completed" : "failed",
      ok,
      resultSummary,
      ...(options.recovered ? { recovered: true } : {}),
    };
    this.entries.set(id, updated);
    return updated;
  }

  get(id: string): ToolStateEntry | undefined {
    return this.entries.get(id);
  }

  list(): ToolStateEntry[] {
    return [...this.entries.values()];
  }
}
