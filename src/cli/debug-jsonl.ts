import { appendFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export interface DebugJsonlLogger {
  log(event: unknown): Promise<void>;
}

export function createDebugJsonlLogger(options: { cwd: string; env?: NodeJS.ProcessEnv; stderr: Pick<NodeJS.WritableStream, "write"> }): DebugJsonlLogger | undefined {
  const env = options.env ?? process.env;
  const setting = env.KAI_DEBUG_JSONL;
  if (!setting) {
    return undefined;
  }

  const target = setting === "1"
    ? path.join(options.cwd, ".kai", "debug.jsonl")
    : setting === "stderr"
      ? "stderr"
      : setting;

  return {
    async log(event: unknown): Promise<void> {
      const line = `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...normalizeEvent(event),
      })}\n`;
      if (target === "stderr") {
        options.stderr.write(line);
        return;
      }
      await mkdir(path.dirname(target), { recursive: true });
      await appendFile(target, line, "utf8");
    },
  };
}

function normalizeEvent(event: unknown): Record<string, unknown> {
  if (typeof event === "object" && event !== null) {
    return event as Record<string, unknown>;
  }
  return { value: event };
}
