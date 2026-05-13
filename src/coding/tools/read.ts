import { stat } from "node:fs/promises";

import { z } from "zod";

import { createToolFailure, type ToolDef, type ToolResult } from "../../foundation/tool.js";
import { isToolResult, resolveToolPath } from "./path.js";
import { runtimeFile } from "./runtime.js";

const MAX_READ_CHARS = 12000;

export const readFileInputSchema = z.object({
  path: z.string().min(1),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().positive().max(MAX_READ_CHARS).optional(),
});

export const readFileTool: ToolDef<typeof readFileInputSchema> = {
  name: "read_file",
  description: "Read a UTF-8 text file inside the current workspace.",
  inputSchema: readFileInputSchema,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      path: { type: "string", description: "Workspace-relative file path to read." },
      offset: { type: "integer", minimum: 0, description: "Optional character offset." },
      limit: { type: "integer", minimum: 1, maximum: MAX_READ_CHARS, description: "Optional max characters." },
    },
    required: ["path"],
  },
  formatPolicy: { maxModelChars: MAX_READ_CHARS, mode: "body" },
  async execute(input, context): Promise<ToolResult> {
    const resolved = resolveToolPath(context.cwd, input.path);
    if (isToolResult(resolved)) {
      return resolved;
    }

    const file = runtimeFile(resolved.absolutePath);
    if (!(await file.exists())) {
      return createToolFailure("not_found", `File '${resolved.relativePath}' does not exist`, {
        path: resolved.relativePath,
      });
    }

    const info = await stat(resolved.absolutePath);
    if (info.isDirectory()) {
      return createToolFailure("validation", `Path '${resolved.relativePath}' is a directory`, {
        path: resolved.relativePath,
      });
    }

    const text = await file.text();
    const offset = input.offset ?? 0;
    const limit = input.limit ?? MAX_READ_CHARS;
    const output = text.slice(offset, offset + limit);
    const truncated = offset + limit < text.length;

    return {
      ok: true,
      output,
      metadata: {
        path: resolved.relativePath,
        bytes: info.size,
        offset,
        limit,
        truncated,
      },
    };
  },
};
