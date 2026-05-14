import { z } from "zod";

import { createToolFailure, type JsonObject, type ToolDef, type ToolResult } from "../../foundation/tool.js";
import { applyPatchPlan, parsePatch, PatchApplyError, PatchParseError, type PatchApplyResult } from "../../patch/index.js";

export const applyPatchInputSchema = z.object({
  patch: z.string().min(1),
});

export const applyPatchTool: ToolDef<typeof applyPatchInputSchema> = {
  name: "apply_patch",
  description: "Apply a structured multi-file patch inside the current workspace.",
  inputSchema: applyPatchInputSchema,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      patch: {
        type: "string",
        description: "Patch text bounded by *** Begin Patch and *** End Patch markers.",
      },
    },
    required: ["patch"],
  },
  formatPolicy: { maxModelChars: 4000, mode: "json", includeMetadataKeys: ["patch"] },
  async execute(input, context): Promise<ToolResult> {
    try {
      const plan = parsePatch(input.patch);
      const result = await applyPatchPlan(context.cwd, plan);
      return {
        ok: true,
        output: result.summary,
        metadata: patchMetadata(result),
      };
    } catch (error) {
      if (error instanceof PatchParseError) {
        return createToolFailure("parse_error", error.message);
      }
      if (error instanceof PatchApplyError) {
        return createToolFailure(error.kind, error.message);
      }
      const message = error instanceof Error ? error.message : String(error);
      return createToolFailure("execution", `apply_patch failed: ${message}`);
    }
  },
};

function patchMetadata(result: PatchApplyResult): JsonObject {
  return {
    patch: {
      counts: {
        add: result.counts.add,
        delete: result.counts.delete,
        update: result.counts.update,
        move: result.counts.move,
      },
      touchedFiles: result.touchedFiles.map((file): JsonObject => ({
        path: file.path,
        operation: file.operation,
        ...(file.moveTo ? { moveTo: file.moveTo } : {}),
        ...(file.bytes === undefined ? {} : { bytes: file.bytes }),
      })),
      summary: result.summary,
    },
  };
}
