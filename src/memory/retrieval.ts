import path from "node:path";

import type { MemoryRecord, MemorySearchResult, MemoryVisibilityContext } from "./types.js";

const MIN_TOKEN_LENGTH = 2;
const MAX_CONTEXT_CHARS = 320;

export function createMemoryVisibilityContext(input: {
  cwd: string;
  sessionId?: string;
}): Required<Pick<MemoryVisibilityContext, "cwd" | "projectIdentity" | "projectCwd" | "projectPath">> & Pick<MemoryVisibilityContext, "sessionId"> {
  const resolved = path.resolve(input.cwd);
  return {
    cwd: resolved,
    projectIdentity: resolved,
    projectCwd: resolved,
    projectPath: resolved,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  };
}

export function filterVisibleMemoryRecords(
  records: readonly MemoryRecord[],
  visibility?: MemoryVisibilityContext,
): MemoryRecord[] {
  return records.filter((record) => isMemoryVisible(record, visibility));
}

export function isMemoryVisible(
  record: MemoryRecord,
  visibility?: MemoryVisibilityContext,
): boolean {
  if (!visibility) {
    return true;
  }

  if (record.scope === "user") {
    return true;
  }

  if (record.scope === "session") {
    return visibility.sessionId !== undefined && record.sourceSessionId === visibility.sessionId;
  }

  const currentProjectKeys = new Set([
    normalizeProjectKey(visibility.cwd),
    normalizeProjectKey(visibility.projectIdentity),
    normalizeProjectKey(visibility.projectCwd),
    normalizeProjectKey(visibility.projectPath),
  ].filter((value): value is string => Boolean(value)));
  const recordProjectKeys = new Set([
    normalizeProjectKey(record.projectIdentity),
    normalizeProjectKey(record.projectCwd),
    normalizeProjectKey(record.projectPath),
  ].filter((value): value is string => Boolean(value)));

  if (currentProjectKeys.size === 0 || recordProjectKeys.size === 0) {
    return false;
  }

  for (const key of currentProjectKeys) {
    if (recordProjectKeys.has(key)) {
      return true;
    }
  }
  return false;
}

export function scoreMemoryRecords(
  records: readonly MemoryRecord[],
  query: string,
  now = new Date(),
): MemorySearchResult[] {
  const queryTokens = tokenizeMemoryText(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const nowMs = now.getTime();
  return records.flatMap((record) => {
    const recordTokens = new Set(tokenizeMemoryText(record.text));
    const matchedTerms = queryTokens.filter((term) => recordTokens.has(term));
    if (matchedTerms.length === 0) {
      return [];
    }

    const updatedAtMs = Date.parse(record.updatedAt);
    const ageMinutes = Number.isFinite(updatedAtMs) ? Math.max(0, Math.floor((nowMs - updatedAtMs) / 60_000)) : 0;
    const score = matchedTerms.length * 10_000 + Math.max(0, 10_000 - ageMinutes);
    const reason = [
      `matched ${matchedTerms.length} term${matchedTerms.length === 1 ? "" : "s"}`,
      matchedTerms.length > 0 ? `terms: ${matchedTerms.join(", ")}` : undefined,
      `updated ${ageMinutes}m ago`,
    ].filter((value): value is string => Boolean(value)).join("; ");

    return [{
      record,
      score,
      reason,
      matchedTerms,
    }];
  }).sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const updated = Date.parse(b.record.updatedAt) - Date.parse(a.record.updatedAt);
    if (updated !== 0) {
      return updated;
    }
    return a.record.id.localeCompare(b.record.id);
  });
}

export function formatMemoryContextText(record: MemoryRecord, maxChars = MAX_CONTEXT_CHARS): string {
  return boundText(record.text, maxChars);
}

export function tokenizeMemoryText(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length >= MIN_TOKEN_LENGTH) ?? [],
  )];
}

function normalizeProjectKey(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return path.resolve(value);
}

function boundText(value: string, maxChars: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

