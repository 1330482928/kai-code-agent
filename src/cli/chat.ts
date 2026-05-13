import type { Readable, Writable } from "node:stream";

import type { ProviderAdapter } from "../provider/types.js";
import type { LoadedSession, PromptSubmission, SessionRecord } from "../session/types.js";
import type { SqliteSessionStore } from "../session/sqlite-store.js";
import { rebuildProviderMessages } from "../session/rebuild.js";
import { replaySessionPlain } from "../session/export.js";
import { runInkChatPrompt } from "../ui/tui.js";

export interface ChatLoopStreams {
  stdin?: Readable;
  stdout?: Writable;
  stderr?: Writable;
}

export interface ChatLoopOptions extends ChatLoopStreams {
  store: SqliteSessionStore;
  sessionId?: string;
  cwd: string;
  model: string;
  createProvider(): ProviderAdapter;
  runTurn(input: {
    task: string;
    model: string;
    provider: ProviderAdapter;
    session: SessionRecord;
    loaded?: LoadedSession;
    submission: PromptSubmission;
  }): Promise<void>;
}

export async function runChatLoop(options: ChatLoopOptions): Promise<void> {
  let loaded = options.sessionId ? options.store.loadSession(options.sessionId) : undefined;
  if (options.sessionId && !loaded) {
    throw new Error(`Session not found: ${options.sessionId}`);
  }
  const session = loaded?.session ?? options.store.createSession({ cwd: options.cwd });

  for (;;) {
    const submission = await runInkChatPrompt(
      {
        sessionId: session.id,
        loaded,
      },
      {
        stdin: options.stdin,
        stdout: options.stdout,
        stderr: options.stderr,
      },
    );
    const task = submission.text.trim();
    const effectiveTask = task || (submission.metadata?.requestedProfile === "plan" ? "Create an implementation plan." : "");
    if (!effectiveTask) {
      continue;
    }
    await options.runTurn({
      task: effectiveTask,
      model: options.model,
      provider: options.createProvider(),
      session,
      loaded,
      submission,
    });
    loaded = options.store.loadSession(session.id);
  }
}

export function writeChatSnapshot(
  store: SqliteSessionStore,
  input: {
    sessionId?: string;
    cwd: string;
    stdout: Writable;
  },
): SessionRecord {
  const loaded = input.sessionId ? store.loadSession(input.sessionId) : undefined;
  if (input.sessionId && !loaded) {
    throw new Error(`Session not found: ${input.sessionId}`);
  }
  const session = loaded?.session ?? store.createSession({ cwd: input.cwd });
  input.stdout.write(`Chat session: ${session.id}\n`);
  if (loaded) {
    input.stdout.write(replaySessionPlain(loaded));
  }
  return session;
}

export function historyForRun(loaded: LoadedSession | undefined) {
  return loaded ? rebuildProviderMessages(loaded) : undefined;
}
