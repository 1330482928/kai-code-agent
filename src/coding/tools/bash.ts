import { z } from "zod";

import { createToolFailure, type ToolDef, type ToolResult } from "../../foundation/tool.js";
import { runtimeSpawnShell } from "./runtime.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const PREVIEW_CHARS = 6000;

export const bashInputSchema = z.object({
  command: z.string().min(1),
  timeout: z.number().int().positive().max(MAX_TIMEOUT_MS).optional(),
  description: z.string().optional(),
});

export const bashTool: ToolDef<typeof bashInputSchema> = {
  name: "bash",
  description: "Run a foreground shell command in the current workspace.",
  inputSchema: bashInputSchema,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      command: { type: "string", description: "Shell command to run." },
      timeout: { type: "integer", minimum: 1, maximum: MAX_TIMEOUT_MS, description: "Timeout in milliseconds." },
      description: { type: "string", description: "Short human-readable command purpose." },
    },
    required: ["command"],
  },
  formatPolicy: { maxModelChars: 8000, mode: "json", includeMetadataKeys: ["bash"] },
  async execute(input, context): Promise<ToolResult> {
    const timeoutMs = input.timeout ?? DEFAULT_TIMEOUT_MS;
    if (context.signal.aborted) {
      return {
        ...createToolFailure("interrupted", "Command was interrupted before it started"),
        metadata: {
          bash: {
            command: input.command,
            description: input.description ?? "",
            stdoutPreview: "",
            stderrPreview: "",
            exitCode: null,
            interrupted: true,
            interruptedReason: "abort",
            outputBytes: 0,
          },
        },
      };
    }

    const startedAt = Date.now();
    let totalBytes = 0;
    const result = await runtimeSpawnShell({
      command: input.command,
      cwd: context.cwd,
      signal: context.signal,
      timeoutMs,
      onOutput(chunk) {
        totalBytes += Buffer.byteLength(chunk.text);
        return context.emit({
          type: "bash_progress",
          toolCallId: context.toolCallId,
          output: chunk.text,
          elapsedMs: Date.now() - startedAt,
          totalBytes,
        });
      },
    });
    const outputBytes = Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr);
    const stdoutPreview = preview(result.stdout);
    const stderrPreview = preview(result.stderr);
    const interrupted = result.interrupted;
    const interruptedReason = result.interruptedReason ?? (interrupted ? "timeout" : undefined);
    const errorKind = interruptedReason === "abort" ? "interrupted" as const : "timeout" as const;
    const errorMessage = interruptedReason === "abort"
      ? "Command was interrupted"
      : `Command exceeded timeout of ${timeoutMs}ms`;

    return {
      ok: !interrupted,
      output: summarizeBash(input.command, result.exitCode, stdoutPreview, stderrPreview, interrupted, interruptedReason),
      metadata: {
        bash: {
          command: input.command,
          description: input.description ?? "",
          stdoutPreview,
          stderrPreview,
          exitCode: interrupted ? null : result.exitCode,
          interrupted,
          ...(interruptedReason ? { interruptedReason } : {}),
          outputBytes,
        },
      },
      ...(interrupted
        ? {
            error: {
              kind: errorKind,
              message: errorMessage,
            },
          }
        : {}),
    };
  },
};

function summarizeBash(
  command: string,
  exitCode: number | null,
  stdoutPreview: string,
  stderrPreview: string,
  interrupted: boolean,
  interruptedReason?: "timeout" | "abort",
): string {
  if (interrupted) {
    return interruptedReason === "abort" ? `Command interrupted: ${command}` : `Command timed out: ${command}`;
  }
  const parts = [`Command exited with code ${exitCode ?? "unknown"}: ${command}`];
  if (stdoutPreview) {
    parts.push(`stdout:\n${stdoutPreview}`);
  }
  if (stderrPreview) {
    parts.push(`stderr:\n${stderrPreview}`);
  }
  return parts.join("\n");
}

function preview(text: string): string {
  if (text.length <= PREVIEW_CHARS) {
    return text;
  }
  return `${text.slice(0, PREVIEW_CHARS)}\n[truncated ${text.length - PREVIEW_CHARS} chars]`;
}
