import {
  createToolFailure,
  isJsonObject,
  type ExecutableToolUse,
  type ToolContext,
  type ToolRegistryLike,
  type ToolResult,
} from "./runner-types.js";

export async function runTool(
  registry: ToolRegistryLike,
  toolUse: ExecutableToolUse,
  context: ToolContext,
): Promise<ToolResult> {
  if (!isJsonObject(toolUse.input)) {
    return createToolFailure("parse_error", `Tool '${toolUse.name}' input must be a parsed JSON object`);
  }

  const tool = registry.get(toolUse.name);
  if (!tool) {
    return createToolFailure("not_found", `Unknown tool '${toolUse.name}'`, {
      toolName: toolUse.name,
    });
  }

  const parsed = tool.inputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return createToolFailure("validation", `Invalid input for tool '${toolUse.name}': ${parsed.error.message}`, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  try {
    return await tool.execute(parsed.data, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createToolFailure("execution", `Tool '${toolUse.name}' failed: ${message}`);
  }
}
