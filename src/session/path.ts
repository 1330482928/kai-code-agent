import path from "node:path";
import { homedir } from "node:os";

export interface SessionPathOptions {
  env?: NodeJS.ProcessEnv;
  sessionDbPath?: string;
}

export function getDefaultSessionDbPath(options: SessionPathOptions = {}): string {
  const env = options.env ?? process.env;
  return options.sessionDbPath
    ?? env.KAI_SESSION_DB_PATH
    ?? path.join(homedir(), ".kai-code-agent", "sessions.sqlite");
}
