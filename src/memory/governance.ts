import { randomUUID } from "node:crypto";

import { projectMessageText } from "../session/projector.js";
import type { LoadedSession } from "../session/types.js";

import type {
  MemoryAuditEvent,
  MemoryCandidate,
  MemoryCandidateRisk,
  MemoryRecord,
  MemoryScope,
  MemoryType,
} from "./types.js";
import type { SqliteMemoryStore } from "./store.js";

const EXTRACTION_TRIGGERS = [
  "remember",
  "prefer",
  "decision",
  "use",
  "always",
  "never",
  "project",
  "should",
  "must",
];

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bapi[\s_-]?key\b/i, "contains api key"],
  [/\btoken\b/i, "contains token"],
  [/\bprivate key\b/i, "contains private key"],
  [/\bcookie\b/i, "contains cookie"],
  [/\bauthorization:\s*bearer\b/i, "contains bearer auth"],
  [/\b\.env\b/i, "contains .env reference"],
  [/-----begin [^-]+private key-----/i, "contains private key material"],
  [/\bpassword\b/i, "contains password"],
];

export interface MemoryExtractionOptions {
  now?: Date;
  write?: boolean;
}

export interface MemoryCandidateReview {
  candidate: MemoryCandidate;
  blocked: boolean;
  reason?: string;
  record?: MemoryRecord;
  event?: MemoryAuditEvent;
}

export class MemoryGovernance {
  constructor(private readonly store: SqliteMemoryStore) {}

  extract(loaded: LoadedSession, options: MemoryExtractionOptions = {}): MemoryCandidate[] {
    void options;
    return extractMemoryCandidates(loaded);
  }

  reviewCandidate(candidate: MemoryCandidate): MemoryCandidateReview {
    const finding = guardMemoryCandidate(candidate);
    if (!finding.allowed) {
      const event = this.store.recordEvent({
        memoryId: candidate.id,
        action: "block",
        detail: finding.reason,
      });
      return {
        candidate,
        blocked: true,
        reason: finding.reason,
        event,
      };
    }

    const record = this.store.add({
      id: candidate.id,
      scope: candidate.suggestedScope,
      type: candidate.type,
      text: candidate.text,
    });
    const event = this.store.recordEvent({
      memoryId: record.id,
      action: "extract",
      detail: candidate.reason,
    });
    return {
      candidate,
      blocked: false,
      record,
      event,
    };
  }

  archive(id: string): MemoryRecord | undefined {
    const updated = this.store.setStatus(id, "archived");
    if (updated) {
      this.store.recordEvent({ memoryId: id, action: "archive", detail: "archived by CLI" });
    }
    return updated;
  }

  stale(id: string): MemoryRecord | undefined {
    const updated = this.store.setStatus(id, "stale");
    if (updated) {
      this.store.recordEvent({ memoryId: id, action: "stale", detail: "marked stale by CLI" });
    }
    return updated;
  }

  refresh(id: string): MemoryRecord | undefined {
    const existing = this.store.get(id);
    if (!existing) {
      return undefined;
    }
    const updated = this.store.updateText(id, existing.text);
    if (updated) {
      this.store.setStatus(id, "active");
      this.store.recordEvent({ memoryId: id, action: "refresh", detail: "refreshed by CLI" });
    }
    return this.store.get(id);
  }

  promote(id: string, scope: MemoryScope): MemoryRecord | undefined {
    const existing = this.store.get(id);
    if (!existing) {
      return undefined;
    }
    const updated = this.store.updateScope(id, {
      scope,
      projectIdentity: scope === "project" || scope === "projectLocal" ? existing.projectIdentity ?? existing.projectPath ?? existing.projectCwd : undefined,
      projectCwd: scope === "project" || scope === "projectLocal" ? existing.projectCwd ?? existing.projectPath ?? existing.projectIdentity : undefined,
      projectPath: scope === "project" || scope === "projectLocal" ? existing.projectPath ?? existing.projectCwd ?? existing.projectIdentity : undefined,
      sourceSessionId: scope === "session" ? existing.sourceSessionId : undefined,
      sourceMessageId: scope === "session" ? existing.sourceMessageId : undefined,
    });
    if (updated) {
      this.store.recordEvent({ memoryId: id, action: "promote", detail: `promoted to ${scope}` });
    }
    return updated;
  }

  merge(primaryId: string, duplicateIds: string[]): MemoryRecord | undefined {
    const merged = this.store.merge(primaryId, duplicateIds);
    if (merged) {
      this.store.recordEvent({
        memoryId: primaryId,
        action: "merge",
        detail: `merged ${duplicateIds.length} memory record${duplicateIds.length === 1 ? "" : "s"}`,
      });
    }
    return merged;
  }

  delete(id: string): MemoryRecord | undefined {
    const existing = this.store.get(id);
    if (!existing) {
      return undefined;
    }
    this.store.recordEvent({ memoryId: id, action: "delete", detail: "deleted by CLI" });
    return this.store.delete(id);
  }
}

export function extractMemoryCandidates(loaded: LoadedSession): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  for (const message of loaded.messages) {
    const text = projectMessageText(message).trim();
    if (!text) {
      continue;
    }
    const lower = text.toLowerCase();
    if (!EXTRACTION_TRIGGERS.some((trigger) => lower.includes(trigger))) {
      continue;
    }
    const secret = guardMemoryText(text);
    const type = inferCandidateType(lower);
    const scope = inferCandidateScope(lower);
    const blocked = !secret.allowed;
    candidates.push({
      id: `memcand_${randomUUID()}`,
      text: collapseText(text, 280),
      type,
      suggestedScope: scope,
      reason: `extracted from ${message.role} message ${message.ordinal}`,
      confidence: blocked ? 0.25 : 0.8,
      sourceMessageIds: [message.id],
      risk: blocked ? "high" : inferCandidateRisk(lower),
    });
  }
  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}

export function guardMemoryCandidate(candidate: MemoryCandidate): { allowed: boolean; reason: string } {
  const secret = guardMemoryText(candidate.text);
  if (!secret.allowed) {
    return secret;
  }
  return { allowed: true, reason: "clean" };
}

export function guardMemoryText(text: string): { allowed: boolean; reason: string } {
  for (const [pattern, reason] of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason };
    }
  }
  return { allowed: true, reason: "clean" };
}

function inferCandidateType(lowerText: string): MemoryType {
  if (lowerText.includes("prefer") || lowerText.includes("always") || lowerText.includes("never")) {
    return "preference";
  }
  if (lowerText.includes("decision") || lowerText.includes("choose") || lowerText.includes("approved")) {
    return "decision";
  }
  if (lowerText.includes("project")) {
    return "project";
  }
  return "fact";
}

function inferCandidateScope(lowerText: string): MemoryScope {
  if (lowerText.includes("session")) {
    return "session";
  }
  if (lowerText.includes("project") || lowerText.includes("workspace")) {
    return "projectLocal";
  }
  return "user";
}

function inferCandidateRisk(lowerText: string): MemoryCandidateRisk {
  if (lowerText.includes("project") || lowerText.includes("session")) {
    return "medium";
  }
  return "low";
}

function collapseText(value: string, maxChars: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}
