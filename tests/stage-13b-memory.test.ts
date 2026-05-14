import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMemoryVisibilityContext,
  main,
  openSqliteMemoryStore,
  openSqliteSessionStore,
  type MemoryRecord,
} from "../src/index.js";

const tempDirs: string[] = [];
const hasBun = "Bun" in globalThis;
const bunIt = hasBun ? it : it.skip;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("stage-13b memory governance", () => {
  bunIt("extracts reviewable candidates, blocks secrets, and writes only safe records", async () => {
    const dir = await tempDir();
    const memoryDbPath = path.join(dir, "memory.sqlite");
    const sessionDbPath = path.join(dir, "sessions.sqlite");
    const workspace = path.join(dir, "workspace");
    await mkdir(workspace, { recursive: true });

    const sessionStore = await openSqliteSessionStore(sessionDbPath);
    try {
      const session = sessionStore.createSession({ cwd: workspace });
      const first = sessionStore.appendMessage({
        sessionId: session.id,
        role: "user",
        summary: "prefer concise answers",
      });
      sessionStore.appendPart({
        messageId: first.id,
        type: "text",
        text: "Prefer concise answers",
      });
      const second = sessionStore.appendMessage({
        sessionId: session.id,
        role: "user",
        summary: "remember api key",
      });
      sessionStore.appendPart({
        messageId: second.id,
        type: "text",
        text: "Remember API key is sk-test-12345",
      });

      const output = createWritableCollector();
      await main([
        "memory",
        "extract",
        "--session-id",
        session.id,
        "--write",
      ], {
        cwd: workspace,
        env: {
          HOME: dir,
          KAI_MEMORY_DB_PATH: memoryDbPath,
          KAI_SESSION_DB_PATH: sessionDbPath,
        },
        stdout: output.stream,
      });

      expect(output.output()).toContain("blocked=contains api key");
      expect(output.output()).toContain("Prefer concise answers");

      const store = await openSqliteMemoryStore(memoryDbPath);
      try {
        const visible = store.list({ visibility: createMemoryVisibilityContext({ cwd: workspace, sessionId: session.id }) });
        expect(visible).toHaveLength(1);
        expect(visible[0]).toMatchObject({
          scope: "user",
          type: "preference",
          status: "active",
        });
        expect(visible[0]?.text).toContain("Prefer concise answers");

        const events = store.listEvents();
        expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["extract", "block"]));
      } finally {
        store.close();
      }
    } finally {
      sessionStore.close();
    }
  });

  it("archives, refreshes, promotes, and merges memory records", async () => {
    const dir = await tempDir();
    const memoryDbPath = path.join(dir, "memory.sqlite");
    const workspace = path.join(dir, "workspace");
    await mkdir(workspace, { recursive: true });

    const store = await openSqliteMemoryStore(memoryDbPath);
    try {
      const active = store.add({
        scope: "user",
        type: "fact",
        text: "Keep this active",
      });
      const stale = store.add({
        scope: "user",
        type: "fact",
        status: "stale",
        text: "Keep this stale",
      });
      const projectLocal = store.add({
        scope: "projectLocal",
        type: "project",
        text: "Project local note",
        projectIdentity: workspace,
        projectCwd: workspace,
        projectPath: workspace,
      });
      const mergedPrimary = store.add({
        scope: "user",
        type: "reference",
        text: "Primary note",
      });
      const mergedDuplicate = store.add({
        scope: "user",
        type: "reference",
        text: "Duplicate note",
      });
      store.close();

      await main(["memory", "archive", active.id], {
        cwd: workspace,
        env: {
          HOME: dir,
          KAI_MEMORY_DB_PATH: memoryDbPath,
        },
      });
      await main(["memory", "refresh", stale.id], {
        cwd: workspace,
        env: {
          HOME: dir,
          KAI_MEMORY_DB_PATH: memoryDbPath,
        },
      });
      await main(["memory", "promote", projectLocal.id, "--scope", "project"], {
        cwd: workspace,
        env: {
          HOME: dir,
          KAI_MEMORY_DB_PATH: memoryDbPath,
        },
      });
      await main(["memory", "merge", mergedPrimary.id, mergedDuplicate.id], {
        cwd: workspace,
        env: {
          HOME: dir,
          KAI_MEMORY_DB_PATH: memoryDbPath,
        },
      });

      const refreshedStore = await openSqliteMemoryStore(memoryDbPath);
      try {
        expect(refreshedStore.get(active.id)?.status).toBe("archived");
        expect(refreshedStore.get(stale.id)?.status).toBe("active");
        expect(refreshedStore.get(projectLocal.id)?.scope).toBe("project");
        expect(refreshedStore.get(projectLocal.id)?.projectPath).toBe(path.resolve(workspace));
        const merged = refreshedStore.get(mergedPrimary.id);
        expect(merged?.text).toContain("Primary note");
        expect(merged?.text).toContain("Duplicate note");
        expect(refreshedStore.get(mergedDuplicate.id)).toBeUndefined();
        expect(refreshedStore.list({ visibility: createMemoryVisibilityContext({ cwd: workspace }) }).map((record) => record.id)).toEqual(
          expect.not.arrayContaining([active.id]),
        );
      } finally {
        refreshedStore.close();
      }
    } finally {
      try {
        store.close();
      } catch {
        // store may already be closed above for command execution
      }
    }
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-stage13b-"));
  tempDirs.push(dir);
  return dir;
}

function createWritableCollector(): {
  stream: Writable;
  output(): string;
} {
  let output = "";
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    }),
    output() {
      return output;
    },
  };
}
