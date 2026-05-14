import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { getDefaultBashTaskStorePath, JsonBashTaskStore, type BashTaskRecord } from "../coding/tools/bash-task-store.js";
import type { CliOptions } from "./main.js";

export interface TaskReadResult {
  task: BashTaskRecord;
  output?: string;
  outputTruncated?: boolean;
}

export async function loadTaskStore(options: CliOptions): Promise<JsonBashTaskStore> {
  return new JsonBashTaskStore(getDefaultBashTaskStorePath({ cwd: options.cwd ?? process.cwd() }));
}

export async function listTasks(options: CliOptions): Promise<BashTaskRecord[]> {
  const store = await loadTaskStore(options);
  return store.listTasks();
}

export async function readTask(options: CliOptions, taskId: string, tailBytes = 8_192): Promise<TaskReadResult> {
  const store = await loadTaskStore(options);
  const task = await store.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  if (!task.outputPath) {
    return { task };
  }

  const output = await readTaskOutput(task.outputPath, tailBytes);
  return {
    task,
    output: output.text,
    outputTruncated: output.truncated,
  };
}

export function formatTaskList(tasks: BashTaskRecord[]): string {
  if (tasks.length === 0) {
    return "No tasks found.\n";
  }
  return `${[
    "id\tstatus\tcommand\tcwd\texitCode\toutputBytes\toutputPath\tpreview",
    ...tasks.map((task) => [
      task.id,
      task.status,
      task.command,
      task.cwd,
      String(task.exitCode ?? ""),
      String(task.outputBytes ?? 0),
      task.outputPath ?? "",
      task.preview,
    ].join("\t")),
  ].join("\n")}\n`;
}

export function formatTaskRead(result: TaskReadResult): string {
  const lines = [
    `Task: ${result.task.id}`,
    `Status: ${result.task.status}`,
    `Command: ${result.task.command}`,
    `Cwd: ${result.task.cwd}`,
    `Exit code: ${String(result.task.exitCode ?? "")}`,
    `Output bytes: ${String(result.task.outputBytes ?? 0)}`,
    result.task.outputPath ? `Output path: ${result.task.outputPath}` : "Output path: ",
    `Preview: ${result.task.preview}`,
    "",
  ];
  if (result.output) {
    lines.push(result.output);
    if (result.outputTruncated) {
      lines.push("");
      lines.push(`[truncated output; inspect ${result.task.outputPath}]`);
    }
  } else {
    lines.push("No output recorded yet.");
  }
  return `${lines.join("\n")}\n`;
}

async function readTaskOutput(outputPath: string, tailBytes: number): Promise<{ text: string; truncated: boolean }> {
  const outputStat = await stat(outputPath);
  const text = await readFile(outputPath, "utf8");
  if (outputStat.size <= tailBytes || text.length <= tailBytes) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(Math.max(0, text.length - tailBytes)),
    truncated: true,
  };
}

