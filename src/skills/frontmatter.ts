import { parse as parseYaml } from "yaml";

import type { ParsedSkillMarkdown, SkillDiagnostic, SkillMetadata } from "./types.js";

const DEFAULT_DESCRIPTION = "No description provided.";
const MAX_DESCRIPTION_CHARS = 240;
const MAX_WHEN_TO_USE_CHARS = 600;

export interface ParseSkillMarkdownInput {
  content: string;
  skillPath?: string;
  directoryName: string;
}

export function parseSkillMarkdown(input: ParseSkillMarkdownInput): ParsedSkillMarkdown {
  const diagnostics: SkillDiagnostic[] = [];
  const split = splitSkillFrontmatter(input.content);
  diagnostics.push(...split.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    ...(input.skillPath ? { path: input.skillPath } : {}),
  })));

  const frontmatter = parseFrontmatterYaml(split.frontmatter, input.skillPath, diagnostics);
  const fallbackName = sanitizeSkillName(input.directoryName) || "skill";
  const name = parseName(frontmatter.name, fallbackName, input.skillPath, diagnostics);
  const description = parseDescription(frontmatter.description, split.body);
  const whenToUse = parseOptionalString(frontmatter.whenToUse, MAX_WHEN_TO_USE_CHARS);
  const allowedTools = parseAllowedTools(frontmatter.allowedTools, input.skillPath, diagnostics);
  const priority = parsePriority(frontmatter.priority, input.skillPath, diagnostics);

  const metadata: SkillMetadata = {
    name,
    normalizedName: normalizeSkillName(name),
    description,
    ...(whenToUse ? { whenToUse } : {}),
    ...(allowedTools ? { allowedTools } : {}),
    ...(priority !== undefined ? { priority } : {}),
  };

  return {
    metadata,
    bodyPreview: boundText(split.body, 2_000),
    diagnostics,
  };
}

export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase();
}

export function sanitizeSkillName(name: string): string {
  const trimmed = name.trim();
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function boundText(value: string, maxChars: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function splitSkillFrontmatter(content: string): {
  frontmatter?: string;
  body: string;
  diagnostics: SkillDiagnostic[];
} {
  const normalized = content.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { body: normalized, diagnostics: [] };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex === -1) {
    return {
      body: normalized,
      diagnostics: [{ severity: "error", message: "SKILL.md frontmatter is missing a closing --- fence" }],
    };
  }

  return {
    frontmatter: lines.slice(1, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n"),
    diagnostics: [],
  };
}

function parseFrontmatterYaml(
  frontmatter: string | undefined,
  skillPath: string | undefined,
  diagnostics: SkillDiagnostic[],
): Record<string, unknown> {
  if (!frontmatter) {
    return {};
  }
  try {
    const parsed = parseYaml(frontmatter);
    if (parsed === null || parsed === undefined) {
      return {};
    }
    if (!isRecord(parsed)) {
      diagnostics.push({
        severity: "error",
        message: "SKILL.md frontmatter must be a YAML object",
        ...(skillPath ? { path: skillPath } : {}),
      });
      return {};
    }
    return parsed;
  } catch (error) {
    diagnostics.push({
      severity: "error",
      message: `SKILL.md frontmatter could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      ...(skillPath ? { path: skillPath } : {}),
    });
    return {};
  }
}

function parseName(
  value: unknown,
  fallbackName: string,
  skillPath: string | undefined,
  diagnostics: SkillDiagnostic[],
): string {
  if (value === undefined) {
    return fallbackName;
  }
  if (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.trim())) {
    return value.trim();
  }
  diagnostics.push({
    severity: "warning",
    message: "Invalid skill name in frontmatter; using directory name",
    ...(skillPath ? { path: skillPath } : {}),
  });
  return fallbackName;
}

function parseDescription(value: unknown, body: string): string {
  if (typeof value === "string" && value.trim()) {
    return boundText(value, MAX_DESCRIPTION_CHARS);
  }
  return firstBodyParagraph(body) || DEFAULT_DESCRIPTION;
}

function parseOptionalString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return boundText(value, maxChars);
}

function parseAllowedTools(
  value: unknown,
  skillPath: string | undefined,
  diagnostics: SkillDiagnostic[],
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    const tools = value.split(",").map((tool) => tool.trim()).filter(Boolean);
    return tools.length > 0 ? tools : undefined;
  }
  if (Array.isArray(value) && value.every((tool) => typeof tool === "string" && tool.trim())) {
    return value.map((tool) => tool.trim());
  }
  diagnostics.push({
    severity: "warning",
    message: "Invalid allowedTools value in skill frontmatter; expected a string or string array",
    ...(skillPath ? { path: skillPath } : {}),
  });
  return undefined;
}

function parsePriority(
  value: unknown,
  skillPath: string | undefined,
  diagnostics: SkillDiagnostic[],
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  diagnostics.push({
    severity: "warning",
    message: "Invalid priority value in skill frontmatter; expected a finite number",
    ...(skillPath ? { path: skillPath } : {}),
  });
  return undefined;
}

function firstBodyParagraph(body: string): string {
  const paragraphs = body.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  for (const paragraph of paragraphs) {
    const text = paragraph
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("#"))
      .join(" ");
    const bounded = boundText(text, MAX_DESCRIPTION_CHARS);
    if (bounded) {
      return bounded;
    }
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
