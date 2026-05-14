import { readFile } from "node:fs/promises";

import type { SkillCatalogEntry, SkillDiagnostic } from "./types.js";

const DEFAULT_MAX_SKILL_BODY_CHARS = 80_000;
const MAX_LOADER_DIAGNOSTIC_CHARS = 300;

export interface LoadSkillBodyOptions {
  entry: SkillCatalogEntry;
  maxChars?: number;
}

export interface LoadedSkillBody {
  entry: SkillCatalogEntry;
  content?: string;
  diagnostics: SkillDiagnostic[];
  truncated: boolean;
}

export async function loadSkillBody(options: LoadSkillBodyOptions): Promise<LoadedSkillBody> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_SKILL_BODY_CHARS;
  try {
    const content = await readFile(options.entry.sourcePath, "utf8");
    if (content.length <= maxChars) {
      return {
        entry: options.entry,
        content,
        diagnostics: [],
        truncated: false,
      };
    }
    return {
      entry: options.entry,
      content: `${content.slice(0, Math.max(0, maxChars - 16)).trimEnd()}\n...[truncated]`,
      diagnostics: [],
      truncated: true,
    };
  } catch (error) {
    return {
      entry: options.entry,
      diagnostics: [{
        severity: "error",
        path: options.entry.sourcePath,
        name: options.entry.name,
        message: boundLoaderDiagnostic(`Could not load activated skill '${options.entry.name}': ${error instanceof Error ? error.message : String(error)}`),
      }],
      truncated: false,
    };
  }
}

function boundLoaderDiagnostic(message: string): string {
  if (message.length <= MAX_LOADER_DIAGNOSTIC_CHARS) {
    return message;
  }
  return `${message.slice(0, MAX_LOADER_DIAGNOSTIC_CHARS - 3).trimEnd()}...`;
}
