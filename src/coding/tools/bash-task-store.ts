import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type BashTaskStatus = "running" | "exited" | "failed" | "canceled";

export interface BashTaskRecord {
  id: string;
  command: string;
  cwd: string;
  status: BashTaskStatus;
  createdAt: string;
  updatedAt: string;
  preview: string;
  outputBytes: number;
  outputPath?: string;
  exitCode?: number | null;
}

interface BashTaskStoreFile {
  tasks: BashTaskRecord[];
}

export function getDefaultBashTaskStorePath(options: { cwd?: string }): string {
  return path.join(options.cwd ?? process.cwd(), ".kai", "tasks.json");
}

export function getDefaultBashTaskOutputPath(options: { cwd?: string; taskId: string }): string {
  return path.join(options.cwd ?? process.cwd(), ".kai", "tasks", `${options.taskId}.log`);
}

export class JsonBashTaskStore {
  constructor(readonly filePath: string) {}

  async listTasks(): Promise<BashTaskRecord[]> {
    const file = await this.read();
    return file.tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getTask(taskId: string): Promise<BashTaskRecord | undefined> {
    return (await this.read()).tasks.find((task) => task.id === taskId);
  }

  async createTask(record: BashTaskRecord): Promise<void> {
    const file = await this.read();
    file.tasks = [record, ...file.tasks.filter((task) => task.id !== record.id)];
    await this.write(file);
  }

  async updateTask(taskId: string, patch: Partial<BashTaskRecord>): Promise<BashTaskRecord | undefined> {
    const file = await this.read();
    const existing = file.tasks.find((task) => task.id === taskId);
    if (!existing) {
      return undefined;
    }
    Object.assign(existing, patch, { updatedAt: patch.updatedAt ?? new Date().toISOString() });
    await this.write(file);
    return existing;
  }

  async readOutput(taskId: string, tailBytes = 8_192): Promise<{ record?: BashTaskRecord; output?: string; truncated: boolean }> {
    const record = await this.getTask(taskId);
    if (!record?.outputPath) {
      return { record, truncated: false };
    }
    const fileStat = await stat(record.outputPath).catch(() => undefined);
    if (!fileStat) {
      return { record, truncated: false };
    }
    const text = await readFile(record.outputPath, "utf8");
    if (fileStat.size <= tailBytes || text.length <= tailBytes) {
      return { record, output: text, truncated: false };
    }
    return { record, output: text.slice(Math.max(0, text.length - tailBytes)), truncated: true };
  }

  private async read(): Promise<BashTaskStoreFile> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      if (!isTaskStoreFile(parsed)) {
        return { tasks: [] };
      }
      return parsed;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return { tasks: [] };
      }
      throw error;
    }
  }

  private async write(file: BashTaskStoreFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  }
}

function isTaskStoreFile(value: unknown): value is BashTaskStoreFile {
  return typeof value === "object" && value !== null && Array.isArray((value as BashTaskStoreFile).tasks);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
