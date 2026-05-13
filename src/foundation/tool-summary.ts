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
