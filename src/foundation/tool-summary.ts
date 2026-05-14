import type { ExecutableToolUse, JsonValue } from "./tool.js";

export interface ToolUseSummary {
  title: string;
  detail?: string;
}

export function summarizeToolUse(toolUse: ExecutableToolUse): ToolUseSummary {
  if (toolUse.name === "bash") {
    const description = stringValue(toolUse.input.description);
    const command = stringValue(toolUse.input.command);
    return {
      title: "Bash",
      detail: description ? `${description}: ${command}` : command,
    };
  }

  if (toolUse.name === "read_file") {
    return { title: "Read file", detail: stringValue(toolUse.input.path) };
  }

  if (toolUse.name === "write_file") {
    return { title: "Write file", detail: stringValue(toolUse.input.path) };
  }

  if (toolUse.name === "edit_file") {
    return { title: "Edit file", detail: stringValue(toolUse.input.path) };
  }

  if (toolUse.name === "grep") {
    return { title: "Grep", detail: stringValue(toolUse.input.pattern) };
  }

  if (toolUse.name === "glob") {
    return { title: "Glob", detail: stringValue(toolUse.input.pattern) };
  }

  if (toolUse.name === "apply_patch") {
    return { title: "Apply patch", detail: patchPreview(stringValue(toolUse.input.patch)) };
  }

  if (toolUse.name === "ask_user_question") {
    const questions = Array.isArray(toolUse.input.questions) ? toolUse.input.questions : [];
    const first = questions[0];
    const firstQuestion = typeof first === "object" && first !== null && "question" in first
      ? String((first as { question?: unknown }).question ?? "")
      : "";
    return {
      title: "Ask question",
      detail: questions.length > 1 ? `${questions.length} questions: ${firstQuestion}` : firstQuestion,
    };
  }

  if (toolUse.name.startsWith("mcp__")) {
    const parsed = parseMcpToolName(toolUse.name);
    if (parsed) {
      return {
        title: `MCP ${parsed.serverName}/${parsed.toolName}`,
        detail: bounded(JSON.stringify(toolUse.input), 180),
      };
    }
  }

  return {
    title: toolUse.name,
    detail: bounded(JSON.stringify(toolUse.input), 180),
  };
}

function stringValue(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function bounded(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function patchPreview(value: string): string {
  const touched = value.split("\n")
    .filter((line) => line.startsWith("*** Add File: ")
      || line.startsWith("*** Update File: ")
      || line.startsWith("*** Delete File: "))
    .map((line) => line.replace(/^\*\*\* (Add|Update|Delete) File: /, ""))
    .join(", ");
  return bounded(touched || value.replace(/\s+/g, " ").trim(), 180);
}

function parseMcpToolName(toolName: string): { serverName: string; toolName: string } | null {
  const match = /^mcp__([^_].*?)__(.+)$/.exec(toolName);
  if (!match) {
    return null;
  }
  return {
    serverName: match[1] ?? "",
    toolName: match[2] ?? "",
  };
}
