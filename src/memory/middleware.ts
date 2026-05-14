import type { AgentMiddleware } from "../agent/middleware.js";
import { createContextItem, type ContextItem } from "../coding/context/index.js";

import { createMemoryVisibilityContext, formatMemoryContextText } from "./retrieval.js";
import type { MemoryContextItemMetadata, MemorySearchResult } from "./types.js";
import type { SqliteMemoryStore } from "./store.js";

export interface MemoryMiddlewareOptions {
  store: SqliteMemoryStore;
  limit?: number;
  maxContentChars?: number;
  now?: () => Date;
}

export function createMemoryMiddleware(options: MemoryMiddlewareOptions): AgentMiddleware {
  return {
    name: "memory",
    async contextItems(context): Promise<ContextItem[]> {
      const query = context.task.trim();
      if (!query) {
        return [];
      }

      const injectedAt = options.now?.() ?? new Date();
      const results = options.store.search({
        query,
        limit: options.limit ?? 5,
        now: injectedAt,
        visibility: createMemoryVisibilityContext({
          cwd: context.cwd,
          sessionId: context.sessionId,
        }),
      });
      return results.map((result) => {
        const citation = options.store.recordCitation({
          memoryId: result.record.id,
          sessionId: context.sessionId,
          injectedAt: injectedAt.toISOString(),
          reason: result.reason,
          score: result.score,
        });
        return memoryContextItem(result, citation.id, options.store.databasePath, options.maxContentChars);
      });
    },
  };
}

function memoryContextItem(
  result: MemorySearchResult,
  citationId: string,
  storePath: string,
  maxContentChars = 320,
): ContextItem {
  const record = result.record;
  return createContextItem({
    id: `memory:${record.id}`,
    kind: "memory",
    source: "memory.store",
    priority: 28,
    cacheStable: false,
    content: formatMemoryContextText(record, maxContentChars),
    metadata: {
      memoryId: record.id,
      scope: record.scope,
      type: record.type,
      citationId,
      score: result.score,
      retrievalReason: result.reason,
      storePath,
      projectPath: record.projectPath ?? null,
      sourceSessionId: record.sourceSessionId ?? null,
    } satisfies MemoryContextItemMetadata,
  });
}
