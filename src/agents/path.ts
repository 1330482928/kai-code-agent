import path from "node:path";
import { homedir } from "node:os";

export interface AgentRunPathOptions {
  env?: NodeJS.ProcessEnv;
  agentRunDbPath?: string;
}

export function getDefaultAgentRunDbPath(options: AgentRunPathOptions = {}): string {
  const env = options.env ?? process.env;
  return options.agentRunDbPath
    ?? env.KAI_AGENT_RUN_DB_PATH
    ?? path.join(homedir(), ".kai-code-agent", "agent-runs.sqlite");
}

