import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMemoryMiddleware,
  createMemoryVisibilityContext,
  main,
  openSqliteMemoryStore,
  runReactLoop,
  type MemoryRecord,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderInput,
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("stage-10b memory visibility", () => {
  it("keeps user memory global while hiding mismatched project and session memory", async () => {
    const dir = await tempDir();
    const dbPath = path.join(dir, "memory.sqlite");
    const store = await openSqliteMemoryStore(dbPath);
    try {
      const projectA = path.join(dir, "project-a");
      const projectB = path.join(dir, "project-b");
      const sessionA = "sess-a";
      const sessionB = "sess-b";

      const user = store.add({
        scope: "user",
        type: "preference",
        text: "Prefer concise final answers",
      });
      const project = store.add({
        scope: "project",
        type: "fact",
        text: "Project alpha detail",
        projectIdentity: projectA,
        projectCwd: projectA,
        projectPath: projectA,
      });
      const projectLocal = store.add({
        scope: "projectLocal",
        type: "reference",
        text: "Project alpha local note",
        projectIdentity: projectA,
        projectCwd: projectA,
        projectPath: projectA,
      });
      const session = store.add({
        scope: "session",
        type: "decision",
        text: "Session alpha decision",
        sourceSessionId: sessionA,
      });

      const matchedVisibility = createMemoryVisibilityContext({
        cwd: projectA,
        sessionId: sessionA,
      });
      const mismatchedVisibility = createMemoryVisibilityContext({
        cwd: projectB,
        sessionId: sessionB,
      });

      expect(store.list({ visibility: matchedVisibility }).map((record) => record.id)).toEqual(
        expect.arrayContaining([user.id, project.id, projectLocal.id, session.id]),
      );
      expect(store.list({ visibility: mismatchedVisibility }).map((record) => record.id)).toEqual([user.id]);

      const matchingSearch = store.search({
        query: "concise alpha decision",
        visibility: matchedVisibility,
      });
      expect(matchingSearch.map((result) => result.record.id)).toEqual(
        expect.arrayContaining([user.id, project.id, projectLocal.id, session.id]),
      );

      const mismatchedProjectSearch = store.search({
        query: "alpha",
        visibility: mismatchedVisibility,
      });
      expect(mismatchedProjectSearch.map((result) => result.record.id)).toEqual([]);

      const mismatchedSessionSearch = store.search({
        query: "decision",
        visibility: createMemoryVisibilityContext({
          cwd: projectA,
          sessionId: sessionB,
        }),
      });
      expect(mismatchedSessionSearch.map((result) => result.record.id)).toEqual([]);

      const provider = new StagedProvider([[{ type: "text_delta", text: "done" }, { type: "done" }]]);
      await runReactLoop({
        task: "concise alpha decision",
        model: "fixture-model",
        provider,
        cwd: projectB,
        sessionId: sessionB,
        middleware: [createMemoryMiddleware({ store })],
        contextOptions: {
          includeBase: false,
          includeInstructions: false,
          includeRuntime: false,
        },
      });

      const firstInput = provider.inputs[0];
      expect(firstInput?.messages.some((message) => message.role === "system" && message.content.includes(user.text))).toBe(true);
      expect(firstInput?.messages.some((message) => message.role === "system" && message.content.includes(project.text))).toBe(false);
      expect(firstInput?.messages.some((message) => message.role === "system" && message.content.includes(projectLocal.text))).toBe(false);
      expect(firstInput?.messages.some((message) => message.role === "system" && message.content.includes(session.text))).toBe(false);
    } finally {
      store.close();
    }
  });
});

describe("stage-10b memory CLI", () => {
  it("adds, lists, searches, and deletes memory records without starting a provider request", async () => {
    const dir = await tempDir();
    const dbPath = path.join(dir, "memory.sqlite");
    const cwd = path.join(dir, "workspace");
    await mkdir(cwd, { recursive: true });

    const addOutput = createWritableCollector();
    await main([
      "memory",
      "add",
      "--scope",
      "user",
      "--type",
      "preference",
      "Prefer concise answers",
    ], {
      cwd,
      env: {
        HOME: dir,
        KAI_MEMORY_DB_PATH: dbPath,
      },
      stdout: addOutput.stream,
    });
    expect(addOutput.output()).toContain("Memory created");
    expect(addOutput.output()).toContain("user");
    expect(addOutput.output()).toContain("preference");
    expect(addOutput.output()).toContain("Prefer concise answers");

    const listOutput = createWritableCollector();
    await main(["memory", "list"], {
      cwd,
      env: {
        HOME: dir,
        KAI_MEMORY_DB_PATH: dbPath,
      },
      stdout: listOutput.stream,
    });
    expect(listOutput.output()).toContain("id\tscope\ttype");
    expect(listOutput.output()).toContain("status");
    expect(listOutput.output()).toContain("user");
    expect(listOutput.output()).toContain("Prefer concise answers");

    const searchOutput = createWritableCollector();
    await main(["memory", "search", "concise"], {
      cwd,
      env: {
        HOME: dir,
        KAI_MEMORY_DB_PATH: dbPath,
      },
      stdout: searchOutput.stream,
    });
    expect(searchOutput.output()).toContain("score");
    expect(searchOutput.output()).toContain("status");
    expect(searchOutput.output()).toContain("concise");

    const deleteOutput = createWritableCollector();
    const store = await openSqliteMemoryStore(dbPath);
    try {
      const record = store.list({ visibility: createMemoryVisibilityContext({ cwd }) })[0] as MemoryRecord | undefined;
      if (!record) {
        throw new Error("Expected a memory record to exist");
      }
      await main(["memory", "delete", record.id], {
        cwd,
        env: {
          HOME: dir,
          KAI_MEMORY_DB_PATH: dbPath,
        },
        stdout: deleteOutput.stream,
      });
    } finally {
      store.close();
    }
    expect(deleteOutput.output()).toContain("Deleted");

    const afterDelete = createWritableCollector();
    await main(["memory", "list"], {
      cwd,
      env: {
        HOME: dir,
        KAI_MEMORY_DB_PATH: dbPath,
      },
      stdout: afterDelete.stream,
    });
    expect(afterDelete.output()).toContain("No memories found.");
  });
});

describe("stage-13a memory core", () => {
  it("persists status values, filters non-active records from retrieval, and records citations for injection", async () => {
    const dir = await tempDir();
    const dbPath = path.join(dir, "memory.sqlite");
    const store = await openSqliteMemoryStore(dbPath);
    try {
      const cwd = path.join(dir, "workspace");
      const active = store.add({
        scope: "user",
        type: "preference",
        text: "Prefer short answers",
      });
      const stale = store.add({
        scope: "user",
        type: "preference",
        status: "stale",
        text: "Prefer long answers",
      });
      const archived = store.add({
        scope: "user",
        type: "reference",
        status: "archived",
        text: "Archived note",
      });

      expect(active.status).toBe("active");
      expect(stale.status).toBe("stale");
      expect(archived.status).toBe("archived");

      expect(store.get(stale.id)?.status).toBe("stale");
      expect(store.list({ visibility: createMemoryVisibilityContext({ cwd }) }).map((record) => record.id)).toEqual([active.id]);
      expect(store.search({
        query: "answers",
        visibility: createMemoryVisibilityContext({ cwd }),
      }).map((result) => result.record.id)).toEqual([active.id]);

      const provider = new StagedProvider([[{ type: "text_delta", text: "done" }, { type: "done" }]]);
      await runReactLoop({
        task: "Prefer short answers",
        model: "fixture-model",
        provider,
        cwd,
        sessionId: "citation-session",
        middleware: [createMemoryMiddleware({ store, now: () => new Date("2026-05-14T10:00:00.000Z") })],
        contextOptions: {
          includeBase: false,
          includeInstructions: false,
          includeRuntime: false,
        },
      });

      const firstInput = provider.inputs[0];
      expect(firstInput?.messages.some((message) => message.role === "system" && message.content.includes(active.text))).toBe(true);
      expect(firstInput?.messages.some((message) => message.role === "system" && message.content.includes(stale.text))).toBe(false);
      expect(firstInput?.messages.some((message) => message.role === "system" && message.content.includes(archived.text))).toBe(false);

      const citations = store.listCitations("citation-session");
      expect(citations).toHaveLength(1);
      expect(citations[0]).toMatchObject({
        memoryId: active.id,
        sessionId: "citation-session",
        reason: expect.stringContaining("matched"),
      });
    } finally {
      store.close();
    }
  });

  it("rejects unsupported memory statuses", async () => {
    const dir = await tempDir();
    const dbPath = path.join(dir, "memory.sqlite");
    const store = await openSqliteMemoryStore(dbPath);
    try {
      expect(() => store.add({
        scope: "user",
        type: "fact",
        status: "invalid-status" as never,
        text: "Should fail",
      })).toThrow("Unsupported memory status");
    } finally {
      store.close();
    }
  });
});

class StagedProvider implements ProviderAdapter {
  readonly inputs: ProviderInput[] = [];
  private index = 0;

  constructor(private readonly responses: ProviderEvent[][]) {}

  async *stream(input: ProviderInput): AsyncIterable<ProviderEvent> {
    this.inputs.push(input);
    const response = this.responses[this.index] ?? [];
    this.index += 1;
    for (const event of response) {
      yield event;
    }
  }
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-stage10b-"));
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
