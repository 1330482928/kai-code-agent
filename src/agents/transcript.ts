import { randomUUID } from "node:crypto";

import { openSqliteSessionStore, type SqliteSessionStore } from "../session/sqlite-store.js";
import type { SessionRecord, SessionRecorder } from "../session/types.js";
import type { AgentMetadata } from "./types.js";
import { getDefaultAgentRunDbPath } from "./path.js";

export interface OpenSideTranscriptOptions {
  cwd: string;
  agentName: string;
  parentSessionId: string;
  toolCallId: string;
  sessionDbPath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface SideTranscriptHandle {
  store: SqliteSessionStore;
  session: SessionRecord;
  recorder: SessionRecorder;
  databasePath: string;
}

export async function openSideTranscript(options: OpenSideTranscriptOptions): Promise<SideTranscriptHandle> {
  const databasePath = getDefaultAgentRunDbPath({
    ...(options.sessionDbPath ? { agentRunDbPath: options.sessionDbPath } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  const store = await openSqliteSessionStore(databasePath);
  const session = store.createSession({
    id: `sub_${randomUUID()}`,
    cwd: options.cwd,
    title: `sub-agent:${options.agentName}`,
    metadata: {
      kind: "subagent",
      agentName: options.agentName,
      parentSessionId: options.parentSessionId,
      toolCallId: options.toolCallId,
    },
  });
  return {
    store,
    session,
    recorder: store.createRecorder(session.id),
    databasePath,
  };
}

export function sideTranscriptMetadata(agent: AgentMetadata, sideTranscriptId: string): Record<string, string | string[]> {
  return {
    agentName: agent.name,
    sideTranscriptId,
    tools: agent.tools,
    ...(agent.skills ? { skills: agent.skills } : {}),
  };
}

