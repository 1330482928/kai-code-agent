import type { AgentMiddleware } from "../agent/middleware.js";
import { createContextItem, type ContextItem } from "../coding/context/index.js";
import type { PromptSubmission } from "../session/types.js";

import { loadSkillCatalog, type LoadSkillCatalogOptions } from "./catalog.js";
import { loadSkillBody } from "./loader.js";
import { resolveSkillActivation } from "./router.js";
import type { SkillActivation, SkillCatalog, SkillCatalogEntry, SkillDiagnostic } from "./types.js";

export interface BuildSkillContextItemsInput {
  cwd: string;
  task: string;
  promptSubmission?: PromptSubmission;
  homeDir?: string;
  catalog?: SkillCatalog;
  maxSkillBodyChars?: number;
}

export interface SkillMiddlewareResult {
  catalog: SkillCatalog;
  activation?: SkillActivation;
  items: ContextItem[];
  diagnostics: SkillDiagnostic[];
}

export interface SkillsMiddlewareOptions {
  homeDir?: string;
  loadCatalog?: (options: LoadSkillCatalogOptions) => Promise<SkillCatalog>;
  maxSkillBodyChars?: number;
}

export function createSkillsMiddleware(options: SkillsMiddlewareOptions = {}): AgentMiddleware {
  return {
    name: "skills",
    async contextItems(context) {
      const result = await buildSkillContextItemsForRun({
        cwd: context.cwd,
        task: context.task,
        ...(context.promptSubmission ? { promptSubmission: context.promptSubmission } : {}),
        ...(options.homeDir ? { homeDir: options.homeDir } : {}),
        ...(options.maxSkillBodyChars !== undefined ? { maxSkillBodyChars: options.maxSkillBodyChars } : {}),
        ...(options.loadCatalog
          ? { catalog: await options.loadCatalog({
              cwd: context.cwd,
              ...(options.homeDir ? { homeDir: options.homeDir } : {}),
            }) }
          : {}),
      });
      return result.items;
    },
  };
}

export async function buildSkillContextItemsForRun(
  input: BuildSkillContextItemsInput,
): Promise<SkillMiddlewareResult> {
  const catalog = input.catalog ?? await loadSkillCatalog({
    cwd: input.cwd,
    ...(input.homeDir ? { homeDir: input.homeDir } : {}),
  });
  const items: ContextItem[] = orderCatalogForContext(catalog.selected)
    .map((entry, index) => catalogContextItem(entry, index));
  const activation = resolveSkillActivation({
    task: input.task,
    ...(input.promptSubmission ? { submission: input.promptSubmission } : {}),
    catalog,
  });
  const diagnostics: SkillDiagnostic[] = [...catalog.diagnostics];

  if (activation?.entry) {
    const loaded = await loadSkillBody({
      entry: activation.entry,
      ...(input.maxSkillBodyChars !== undefined ? { maxChars: input.maxSkillBodyChars } : {}),
    });
    diagnostics.push(...loaded.diagnostics);
    if (loaded.content) {
      items.push(activatedSkillContextItem({ ...activation, entry: activation.entry }, loaded.content, loaded.truncated));
    }
    for (const diagnostic of loaded.diagnostics) {
      items.push(diagnosticContextItem(diagnostic, activation));
    }
  } else if (activation?.diagnostic) {
    diagnostics.push(activation.diagnostic);
    items.push(diagnosticContextItem(activation.diagnostic, activation));
  }

  return {
    catalog,
    ...(activation ? { activation } : {}),
    items,
    diagnostics,
  };
}

function catalogContextItem(entry: SkillCatalogEntry, index: number): ContextItem {
  return createContextItem({
    id: `skill:catalog:${entry.normalizedName}`,
    kind: "skill",
    source: { type: "skill-catalog", path: entry.sourcePath },
    content: formatCatalogContext(entry),
    priority: 35 + index,
    cacheStable: true,
    metadata: skillMetadata(entry, {
      catalogOnly: true,
      activationMode: "none",
    }),
  });
}

function activatedSkillContextItem(
  activation: SkillActivation & { entry: SkillCatalogEntry },
  body: string,
  truncated: boolean,
): ContextItem {
  return createContextItem({
    id: `skill:activated:${activation.entry.normalizedName}`,
    kind: "skill",
    source: { type: "skill-body", path: activation.entry.sourcePath },
    content: body,
    priority: 25,
    cacheStable: false,
    metadata: skillMetadata(activation.entry, {
      activationMode: activation.mode,
      activationSource: activation.source,
      requestedSkillName: activation.requestedName,
      bodyLoaded: true,
      truncated,
    }),
  });
}

function diagnosticContextItem(
  diagnostic: SkillDiagnostic,
  activation: SkillActivation,
): ContextItem {
  return createContextItem({
    id: `skill:diagnostic:${activation.normalizedName}`,
    kind: "skill",
    source: "skills.activation",
    content: diagnostic.message,
    priority: 24,
    cacheStable: false,
    metadata: {
      diagnostic: true,
      severity: diagnostic.severity,
      requestedSkillName: activation.requestedName,
      activationMode: activation.mode,
      activationSource: activation.source,
    },
  });
}

function formatCatalogContext(entry: SkillCatalogEntry): string {
  return [
    `Skill: ${entry.name}`,
    `Description: ${entry.description}`,
    entry.whenToUse ? `When to use: ${entry.whenToUse}` : undefined,
    entry.allowedTools && entry.allowedTools.length > 0
      ? `Allowed tools advisory: ${entry.allowedTools.join(", ")}`
      : undefined,
    `Source: ${entry.sourcePath}`,
    "Full SKILL.md body is loaded only when this skill is explicitly activated.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function skillMetadata(entry: SkillCatalogEntry, extra: Record<string, string | number | boolean>): Record<string, string | number | boolean | string[]> {
  return {
    skillName: entry.name,
    normalizedName: entry.normalizedName,
    sourcePath: entry.sourcePath,
    selected: entry.selected,
    directoryPriority: entry.directoryPriority,
    ...(entry.priority !== undefined ? { skillPriority: entry.priority } : {}),
    ...(entry.allowedTools ? { allowedTools: entry.allowedTools } : {}),
    ...extra,
  };
}

function orderCatalogForContext(entries: SkillCatalogEntry[]): SkillCatalogEntry[] {
  return [...entries].sort((a, b) => {
    const priority = (b.priority ?? 0) - (a.priority ?? 0);
    if (priority !== 0) {
      return priority;
    }
    const directory = b.directoryPriority - a.directoryPriority;
    if (directory !== 0) {
      return directory;
    }
    return a.normalizedName.localeCompare(b.normalizedName);
  });
}
