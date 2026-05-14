import { parse as parseYaml } from "yaml";

import type { AgentDiagnostic, ParsedAgentMarkdown } from "./types.js";

const DEFAULT_DESCRIPTION = "No description provided.";
const FRONTMATTER_READ_BYTES = 16_384;
const MAX_DESCRIPTION_CHARS = 240;
const MAX_PROMPT_CHARS = 16_000;

export interface ParseAgentMarkdownInput {
  content: string;
  agentPath?: string;
  directoryName: string;
}

export function parseAgentMarkdown(input: ParseAgentMarkdownInput): ParsedAgentMarkdown {
  const diagnostics: AgentDiagnostic[] = [];
  const split = splitFrontmatter(input.content);
  diagnostics.push(...split.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    ...(input.agentPath ? { path: input.agentPath } : {}),
  })));

  const frontmatter = parseFrontmatterYaml(split.frontmatter, input.agentPath, diagnostics);
  const fallbackName = sanitizeAgentName(input.directoryName) || "agent";
  const name = parseName(frontmatter.name, fallbackName, input.agentPath, diagnostics);
  const description = parseDescription(frontmatter.description, split.body);
  const tools = parseStringList(frontmatter.tools, input.agentPath, diagnostics, "tools");
  const skills = parseStringList(frontmatter.skills, input.agentPath, diagnostics, "skills");
  const maxTurns = parseMaxTurns(frontmatter.maxTurns, input.agentPath, diagnostics);
  const prompt = parsePrompt(frontmatter.prompt, split.body);

  return {
    metadata: {
      name,
      normalizedName: normalizeAgentName(name),
      description,
      prompt,
      tools,
      ...(skills.length > 0 ? { skills } : {}),
      ...(maxTurns !== undefined ? { maxTurns } : {}),
    },
    bodyPreview: boundText(split.body, 2_000),
    diagnostics,
  };
}

export function normalizeAgentName(name: string): string {
  return name.trim().toLowerCase();
}

export function sanitizeAgentName(name: string): string {
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

export function readAgentHeaderBytes(): number {
  return FRONTMATTER_READ_BYTES;
}

function splitFrontmatter(content: string): { frontmatter?: string; body: string; diagnostics: AgentDiagnostic[] } {
  const normalized = content.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { body: normalized, diagnostics: [] };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex === -1) {
    return {
      body: normalized,
      diagnostics: [{ severity: "error", message: "agent frontmatter is missing a closing --- fence" }],
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
  agentPath: string | undefined,
  diagnostics: AgentDiagnostic[],
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
        message: "agent frontmatter must be a YAML object",
        ...(agentPath ? { path: agentPath } : {}),
      });
      return {};
    }
    return parsed;
  } catch (error) {
    diagnostics.push({
      severity: "error",
      message: `agent frontmatter could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      ...(agentPath ? { path: agentPath } : {}),
    });
    return {};
  }
}

function parseName(
  value: unknown,
  fallbackName: string,
  agentPath: string | undefined,
  diagnostics: AgentDiagnostic[],
): string {
  if (value === undefined) {
    return fallbackName;
  }
  if (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.trim())) {
    return value.trim();
  }
  diagnostics.push({
    severity: "warning",
    message: "Invalid agent name in frontmatter; using directory name",
    ...(agentPath ? { path: agentPath } : {}),
  });
  return fallbackName;
}

function parseDescription(value: unknown, body: string): string {
  if (typeof value === "string" && value.trim()) {
    return boundText(value, MAX_DESCRIPTION_CHARS);
  }
  return firstBodyParagraph(body) || DEFAULT_DESCRIPTION;
}

function parsePrompt(value: unknown, body: string): string {
  if (typeof value === "string" && value.trim()) {
    return boundText(value, MAX_PROMPT_CHARS);
  }
  return boundText(body, MAX_PROMPT_CHARS);
}

function parseStringList(
  value: unknown,
  agentPath: string | undefined,
  diagnostics: AgentDiagnostic[],
  fieldName: string,
): string[] {
  if (value === undefined) {
    return [];
  }
  const items =
    typeof value === "string"
      ? value.split(",").map((item) => item.trim()).filter(Boolean)
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
        : undefined;
  if (!items || items.length === 0) {
    diagnostics.push({
      severity: "warning",
      message: `Invalid ${fieldName} value in agent frontmatter; expected a string or string array`,
      ...(agentPath ? { path: agentPath } : {}),
    });
    return [];
  }
  return items;
}

function parseMaxTurns(
  value: unknown,
  agentPath: string | undefined,
  diagnostics: AgentDiagnostic[],
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  diagnostics.push({
    severity: "warning",
    message: "Invalid maxTurns value in agent frontmatter; expected a positive finite number",
    ...(agentPath ? { path: agentPath } : {}),
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
