import { z } from "zod";

import { type ToolDef, type ToolResult } from "../../foundation/tool.js";
import { isToolResult, resolveToolPath } from "./path.js";
import { runtimeWrite } from "./runtime.js";

export const writeFileInputSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const writeFileTool: ToolDef<typeof writeFileInputSchema> = {
  name: "write_file",
  description: "Write UTF-8 text content to a file inside the current workspace.",
  inputSchema: writeFileInputSchema,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      path: { type: "string", description: "Workspace-relative file path to write." },
      content: { type: "string", description: "UTF-8 content to write." },
    },
    required: ["path", "content"],
  },
  formatPolicy: { maxModelChars: 1200, mode: "summary", includeMetadataKeys: ["path", "bytes"] },
  async execute(input, context): Promise<ToolResult> {
    const resolved = resolveToolPath(context.cwd, input.path);
    if (isToolResult(resolved)) {
      return resolved;
    }

    const bytes = await runtimeWrite(resolved.absolutePath, input.content);
    return {
      ok: true,
      output: `Wrote ${bytes} bytes to ${resolved.relativePath}`,
      metadata: {
        path: resolved.relativePath,
        bytes,
      },
    };
  },
};
