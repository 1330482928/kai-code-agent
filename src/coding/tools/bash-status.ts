import { z } from "zod";

import { createToolFailure, type ToolDef, type ToolResult } from "../../foundation/tool.js";
import { getDefaultBashTaskStorePath, JsonBashTaskStore } from "./bash-task-store.js";

export const bashStatusInputSchema = z.object({
  taskId: z.string().min(1),
  tailBytes: z.number().int().positive().optional(),
});

export const bashStatusTool: ToolDef<typeof bashStatusInputSchema> = {
  name: "bash_status",
  description: "Inspect the state and output tail of a background bash task.",
  inputSchema: bashStatusInputSchema,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      taskId: { type: "string", description: "Background task id." },
      tailBytes: { type: "integer", minimum: 1, description: "Number of output bytes to show from the tail." },
    },
    required: ["taskId"],
  },
  formatPolicy: { maxModelChars: 8000, mode: "json", includeMetadataKeys: ["bash"] },
  async execute(input, context): Promise<ToolResult> {
    const store = new JsonBashTaskStore(getDefaultBashTaskStorePath({ cwd: context.cwd }));
    const result = await store.readOutput(input.taskId, input.tailBytes ?? 8_192);
    if (!result.record) {
      return createToolFailure("not_found", `Background task not found: ${input.taskId}`);
    }
    return {
      ok: true,
      output: result.output ?? result.record.preview,
      metadata: {
        bash: {
          taskId: result.record.id,
          status: result.record.status,
          command: result.record.command,
          exitCode: result.record.exitCode ?? null,
          outputBytes: result.record.outputBytes,
          ...(result.record.outputPath ? { persistedOutputPath: result.record.outputPath } : {}),
          ...(result.output ? { tailPreview: result.output } : {}),
        },
      },
    };
  },
};
