import { z } from "zod";

import { createToolFailure, type ToolDef, type ToolResult } from "../../foundation/tool.js";
import { isToolResult, resolveToolPath } from "./path.js";
import { runtimeFile, runtimeWrite } from "./runtime.js";

export const editFileInputSchema = z.object({
  path: z.string().min(1),
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().optional(),
});

export const editFileTool: ToolDef<typeof editFileInputSchema> = {
  name: "edit_file",
  description: "Replace exact UTF-8 text in a workspace file.",
  inputSchema: editFileInputSchema,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      path: { type: "string", description: "Workspace-relative file path to edit." },
      oldString: { type: "string", description: "Exact text to replace." },
      newString: { type: "string", description: "Replacement text." },
      replaceAll: { type: "boolean", description: "Replace every exact match when true." },
    },
    required: ["path", "oldString", "newString"],
  },
  formatPolicy: { maxModelChars: 1600, mode: "summary", includeMetadataKeys: ["path", "replacements", "diff"] },
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

    const original = await file.text();
    const matches = countMatches(original, input.oldString);
    if (matches === 0) {
      return createToolFailure("not_found", `Text was not found in '${resolved.relativePath}'`, {
        path: resolved.relativePath,
      });
    }
    if (matches > 1 && input.replaceAll !== true) {
      return createToolFailure("validation", `Text appears ${matches} times in '${resolved.relativePath}'; set replaceAll to true`, {
        path: resolved.relativePath,
        matches,
      });
    }

    const updated = input.replaceAll === true
      ? original.split(input.oldString).join(input.newString)
      : original.replace(input.oldString, input.newString);

    await runtimeWrite(resolved.absolutePath, updated);
    return {
      ok: true,
      output: `Edited ${resolved.relativePath}; replacements: ${input.replaceAll === true ? matches : 1}`,
      metadata: {
        path: resolved.relativePath,
        replacements: input.replaceAll === true ? matches : 1,
        diff: `-${previewLine(input.oldString)}\n+${previewLine(input.newString)}`,
      },
    };
  },
};

function countMatches(text: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    const found = text.indexOf(needle, index);
    if (found === -1) {
      return count;
    }
    count += 1;
    index = found + needle.length;
  }
}

function previewLine(value: string): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > 160 ? `${oneLine.slice(0, 157)}...` : oneLine;
}
