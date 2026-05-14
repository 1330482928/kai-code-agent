import { discoverSkills, type DiscoverSkillsOptions } from "./discovery.js";
import type {
  DiscoveredSkill,
  ShadowedSkill,
  SkillCatalog,
  SkillCatalogEntry,
} from "./types.js";

export type LoadSkillCatalogOptions = DiscoverSkillsOptions;

export async function loadSkillCatalog(options: LoadSkillCatalogOptions): Promise<SkillCatalog> {
  return skillCatalogFromDiscovery(await discoverSkills(options));
}

export function skillCatalogFromDiscovery(discovery: {
  selected: DiscoveredSkill[];
  shadowed: ShadowedSkill[];
  entries: DiscoveredSkill[];
  diagnostics: SkillCatalog["diagnostics"];
}): SkillCatalog {
  const selectedNames = new Set(discovery.selected.map((entry) => entry.normalizedName));
  const shadowedByPath = new Map<string, ShadowedSkill>();
  for (const shadowed of discovery.shadowed) {
    shadowedByPath.set(shadowed.entry.skillPath, shadowed);
  }

  const selected = discovery.selected.map((entry) => toCatalogEntry(entry, true));
  const all = discovery.entries
    .map((entry) => {
      const shadow = shadowedByPath.get(entry.skillPath);
      return toCatalogEntry(entry, selectedNames.has(entry.normalizedName) && !shadow, shadow);
    })
    .sort(compareCatalogEntry);
  const shadowed = all.filter((entry) => !entry.selected);

  return {
    selected,
    all,
    shadowed,
    diagnostics: discovery.diagnostics,
  };
}

export function findSkillCatalogEntry(
  catalog: Pick<SkillCatalog, "selected">,
  requestedName: string,
): SkillCatalogEntry | undefined {
  const normalizedName = requestedName.trim().toLowerCase();
  return catalog.selected.find((entry) => entry.normalizedName === normalizedName);
}

export function formatSkillCatalogList(
  catalog: SkillCatalog,
  options: { all?: boolean } = {},
): string {
  const entries = options.all ? catalog.all : catalog.selected;
  if (entries.length === 0) {
    return "No skills found.\n";
  }

  const header = options.all
    ? "name\tstatus\tpriority\tsource\tdescription\tshadowing"
    : "name\tpriority\tsource\tdescription";
  const rows = entries.map((entry) => {
    const priority = entry.priority === undefined ? "-" : String(entry.priority);
    if (options.all) {
      return [
        entry.name,
        entry.selected ? "selected" : "shadowed",
        priority,
        entry.sourcePath,
        entry.description,
        entry.shadowReason ?? "",
      ].join("\t");
    }
    return [
      entry.name,
      priority,
      entry.sourcePath,
      entry.description,
    ].join("\t");
  });
  return `${[header, ...rows].join("\n")}\n`;
}

export function compareCatalogEntry(a: SkillCatalogEntry, b: SkillCatalogEntry): number {
  const nameCompare = a.normalizedName.localeCompare(b.normalizedName);
  if (nameCompare !== 0) {
    return nameCompare;
  }
  if (a.selected !== b.selected) {
    return a.selected ? -1 : 1;
  }
  return a.sourcePath.localeCompare(b.sourcePath);
}

function toCatalogEntry(
  entry: DiscoveredSkill,
  selected: boolean,
  shadow?: ShadowedSkill,
): SkillCatalogEntry {
  return {
    name: entry.name,
    normalizedName: entry.normalizedName,
    description: entry.description,
    sourcePath: entry.skillPath,
    skillDir: entry.skillDir,
    directoryLabel: entry.directoryLabel,
    directoryPriority: entry.directoryPriority,
    selected,
    ...(entry.whenToUse ? { whenToUse: entry.whenToUse } : {}),
    ...(entry.allowedTools ? { allowedTools: entry.allowedTools } : {}),
    ...(entry.priority !== undefined ? { priority: entry.priority } : {}),
    ...(shadow ? { shadowedBy: shadow.selected.skillPath, shadowReason: shadow.reason } : {}),
    ...(entry.diagnostics.length > 0 ? { diagnostics: entry.diagnostics } : {}),
  };
}
