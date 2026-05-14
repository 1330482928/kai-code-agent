import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  exportContextTrace,
  main,
  openSqliteSessionStore,
} from "../src/index.js";

const tempDirs: string[] = [];
const hasBun = "Bun" in globalThis;
const bunIt = hasBun ? it : it.skip;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("stage-15 context quality", () => {
  bunIt("exports redacted context traces and deterministic replay snapshots", async () => {
    const { cwd, dbPath, sessionId } = await createSessionFixture({
      a: "alpha remember",
      b: "beta secret sk-1234567890 /Users/bytedance/private.txt",
    });

    const traceOut = createWritableCollector();
    await main(["context", "trace", "--session", sessionId], {
      cwd,
      sessionDbPath: dbPath,
      stdout: traceOut.stream,
    });
    const trace = JSON.parse(traceOut.output());
    expect(trace.sessionId).toBe(sessionId);
    expect(JSON.stringify(trace)).not.toContain("sk-1234567890");
    expect(JSON.stringify(trace)).not.toContain("/Users/bytedance/private.txt");
    expect(trace.items.length).toBeGreaterThan(0);
    expect(trace.modelInputDigest.messageCount).toBeGreaterThan(0);

    const replayOut = createWritableCollector();
    await main(["context", "replay", "--session", sessionId], {
      cwd,
      sessionDbPath: dbPath,
      stdout: replayOut.stream,
    });
    const replay = JSON.parse(replayOut.output());
    expect(JSON.stringify(replay)).toContain("[redacted-path]");
    expect(JSON.stringify(replay)).not.toContain("sk-1234567890");
    expect(replay.snapshot.items.length).toBeGreaterThan(0);

    const replayAgain = createWritableCollector();
    await main(["context", "replay", "--session", sessionId], {
      cwd,
      sessionDbPath: dbPath,
      stdout: replayAgain.stream,
    });
    expect(normalizeReplayText(replayAgain.output())).toBe(normalizeReplayText(replayOut.output()));
  });

  bunIt("evaluates fixtures, emits tuning reports, and compares context traces", async () => {
    const { cwd, dbPath, sessionId: sessionA } = await createSessionFixture({
      a: "alpha retained",
      b: "secret sk-1234567890 /Users/bytedance/private.txt",
    });
    const sessionB = await createSessionFixture({
      cwd,
      dbPath,
      sessionId: "sess_b",
      a: "alpha retained",
      b: "beta added for diff",
    });
    const diffStore = await openSqliteSessionStore(dbPath);
    try {
      const loadedB = diffStore.loadSession(sessionB.sessionId);
      expect(loadedB).toBeTruthy();
      const extraUser = diffStore.appendMessage({ sessionId: sessionB.sessionId, role: "user" });
      diffStore.appendPart({ messageId: extraUser.id, type: "text", text: "gamma extra item" });
    } finally {
      diffStore.close();
    }

    const store = await openSqliteSessionStore(dbPath);
    try {
      const loaded = store.loadSession(sessionA);
      expect(loaded).toBeTruthy();
      const trace = await exportContextTrace({
        loadedSession: loaded!,
        cwd,
        model: "fixture-model",
      });
      const fixturePath = path.join(cwd, "context-quality.fixture.json");
      await writeFile(fixturePath, `${JSON.stringify({
        id: "fixture-context-quality",
        trace,
        criticalFacts: ["alpha"],
        forbiddenFacts: ["sk-1234567890"],
        expectedIncludedItemIds: trace.items.filter((item) => item.included).map((item) => item.id),
        expectedExcludedKinds: [],
      }, null, 2)}\n`, "utf8");

      const evalOut = createWritableCollector();
      await main(["context", "eval", fixturePath], {
        cwd,
        sessionDbPath: dbPath,
        stdout: evalOut.stream,
      });
      const evaluation = JSON.parse(evalOut.output());
      expect(evaluation.fixtureId).toBe("fixture-context-quality");
      expect(evaluation.includesCriticalFacts).toBe(true);
      expect(evaluation.excludesForbiddenFacts).toBe(true);
      expect(evaluation.metrics.criticalFactRetention).toBeGreaterThan(0);

      const tuneOut = createWritableCollector();
      await main(["context", "tune", fixturePath], {
        cwd,
        sessionDbPath: dbPath,
        stdout: tuneOut.stream,
      });
      expect(tuneOut.output()).toContain("Context Quality Tuning");
      expect(tuneOut.output()).toContain("critical-fact-priority");

      const diffOut = createWritableCollector();
      await main(["context", "diff", "--session-a", sessionA, "--session-b", sessionB.sessionId], {
        cwd,
        sessionDbPath: dbPath,
        stdout: diffOut.stream,
      });
      expect(diffOut.output()).toContain("Context Debug Diff");
      expect(diffOut.output()).toContain("Item order changed: yes");
    } finally {
      store.close();
    }
  });
});

async function createSessionFixture(input: {
  cwd?: string;
  dbPath?: string;
  sessionId?: string;
  a: string;
  b: string;
}): Promise<{ cwd: string; dbPath: string; sessionId: string }> {
  const cwd = input.cwd ?? await tempDir();
  const dbPath = input.dbPath ?? path.join(cwd, "sessions.sqlite");
  if (!input.cwd) {
    tempDirs.push(cwd);
  }
  const store = await openSqliteSessionStore(dbPath);
  try {
    const session = store.createSession({ id: input.sessionId ?? "sess_a", cwd });
    const user = store.appendMessage({ sessionId: session.id, role: "user" });
    store.appendPart({ messageId: user.id, type: "text", text: input.a });
    const assistant = store.appendMessage({ sessionId: session.id, role: "assistant" });
    store.appendPart({
      messageId: assistant.id,
      type: "text",
      text: input.b,
    });
    return { cwd, dbPath, sessionId: session.id };
  } finally {
    store.close();
  }
}

function createWritableCollector() {
  let text = "";
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        text += chunk.toString();
        callback();
      },
    }),
    output() {
      return text;
    },
  };
}

function normalizeReplayText(text: string): string {
  return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<timestamp>");
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-stage15-"));
  tempDirs.push(dir);
  return dir;
}
