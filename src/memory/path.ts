import path from "node:path";
import { homedir } from "node:os";

export interface MemoryPathOptions {
  env?: NodeJS.ProcessEnv;
  memoryDbPath?: string;
}

export function getDefaultMemoryDbPath(options: MemoryPathOptions = {}): string {
  const env = options.env ?? process.env;
  return options.memoryDbPath
    ?? env.KAI_MEMORY_DB_PATH
    ?? path.join(homedir(), ".kai-code-agent", "memory.sqlite");
}

