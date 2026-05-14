import type { PromptSubmission } from "../session/types.js";

import { findSkillCatalogEntry } from "./catalog.js";
import { normalizeSkillName } from "./frontmatter.js";
import type { SkillActivation, SkillCatalog, SkillDiagnostic } from "./types.js";

const SKILL_PREFIX_PATTERN = /^\s*\$([A-Za-z0-9][A-Za-z0-9._-]*)(?:\s+|$)([\s\S]*)$/;
const MAX_DIAGNOSTIC_CHARS = 300;

export interface ResolveSkillActivationInput {
  task: string;
  submission?: PromptSubmission;
  catalog: Pick<SkillCatalog, "selected">;
}

export interface NormalizedSkillPrompt {
  task: string;
  submission?: PromptSubmission;
}

export function normalizePromptTaskForSkillActivation(
  task: string,
  submission?: PromptSubmission,
): NormalizedSkillPrompt {
  const metadataSkillName = requestedSkillNameFromMetadata(submission);
  if (metadataSkillName) {
    return { task, ...(submission ? { submission } : {}) };
  }

  const prefix = parseLeadingSkillPrefix(task);
  if (!prefix) {
    return { task, ...(submission ? { submission } : {}) };
  }

  return {
    task: prefix.taskText,
    submission: {
      text: prefix.taskText,
      metadata: {
        ...submission?.metadata,
        requestedSkillName: prefix.requestedName,
      },
    },
  };
}

export function resolveSkillActivation(input: ResolveSkillActivationInput): SkillActivation | undefined {
  const metadataSkillName = requestedSkillNameFromMetadata(input.submission);
  const prefix = metadataSkillName ? undefined : parseLeadingSkillPrefix(input.task);
  const requestedName = metadataSkillName ?? prefix?.requestedName;
  if (!requestedName) {
    return undefined;
  }

  const normalizedName = normalizeSkillName(requestedName);
  const entry = findSkillCatalogEntry(input.catalog, requestedName);
  const diagnostic = entry ? undefined : unknownSkillDiagnostic(requestedName);
  return {
    requestedName,
    normalizedName,
    mode: "explicit",
    source: metadataSkillName ? "metadata" : "dollar_prefix",
    taskText: metadataSkillName ? input.task : prefix?.taskText ?? input.task,
    ...(entry ? { entry } : {}),
    ...(diagnostic ? { diagnostic } : {}),
  };
}

export function parseLeadingSkillPrefix(task: string): {
  requestedName: string;
  normalizedName: string;
  taskText: string;
} | undefined {
  const match = SKILL_PREFIX_PATTERN.exec(task);
  const requestedName = match?.[1];
  if (!requestedName) {
    return undefined;
  }
  return {
    requestedName,
    normalizedName: normalizeSkillName(requestedName),
    taskText: match[2] ?? "",
  };
}

export function requestedSkillNameFromMetadata(submission?: PromptSubmission): string | undefined {
  const requested = submission?.metadata?.requestedSkillName;
  return typeof requested === "string" && requested.trim() ? requested.trim() : undefined;
}

function unknownSkillDiagnostic(requestedName: string): SkillDiagnostic {
  return {
    severity: "warning",
    name: requestedName,
    message: boundDiagnostic(`Requested skill '${requestedName}' was not found in the discovered skill catalog.`),
  };
}

function boundDiagnostic(message: string): string {
  if (message.length <= MAX_DIAGNOSTIC_CHARS) {
    return message;
  }
  return `${message.slice(0, MAX_DIAGNOSTIC_CHARS - 3).trimEnd()}...`;
}
