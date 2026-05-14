export type SkillDiagnosticSeverity = "warning" | "error";

export interface SkillDiagnostic {
  severity: SkillDiagnosticSeverity;
  message: string;
  path?: string;
  name?: string;
}

export interface SkillMetadata {
  name: string;
  normalizedName: string;
  description: string;
  whenToUse?: string;
  allowedTools?: string[];
  priority?: number;
}

export interface ParsedSkillMarkdown {
  metadata: SkillMetadata;
  bodyPreview: string;
  diagnostics: SkillDiagnostic[];
}

export interface SkillDirectory {
  path: string;
  label: string;
  priority: number;
}

export interface DiscoveredSkill {
  name: string;
  normalizedName: string;
  description: string;
  whenToUse?: string;
  allowedTools?: string[];
  priority?: number;
  directoryPriority: number;
  directoryLabel: string;
  skillDir: string;
  skillPath: string;
  diagnostics: SkillDiagnostic[];
}

export interface ShadowedSkill {
  entry: DiscoveredSkill;
  selected: DiscoveredSkill;
  reason: string;
}

export interface SkillDiscoveryResult {
  entries: DiscoveredSkill[];
  selected: DiscoveredSkill[];
  shadowed: ShadowedSkill[];
  diagnostics: SkillDiagnostic[];
  directories: SkillDirectory[];
}

export interface SkillCatalogEntry {
  name: string;
  normalizedName: string;
  description: string;
  sourcePath: string;
  skillDir: string;
  directoryLabel: string;
  directoryPriority: number;
  selected: boolean;
  whenToUse?: string;
  allowedTools?: string[];
  priority?: number;
  shadowedBy?: string;
  shadowReason?: string;
  diagnostics?: SkillDiagnostic[];
}

export interface SkillCatalog {
  selected: SkillCatalogEntry[];
  all: SkillCatalogEntry[];
  shadowed: SkillCatalogEntry[];
  diagnostics: SkillDiagnostic[];
}

export interface SkillActivation {
  requestedName: string;
  normalizedName: string;
  mode: "explicit";
  source: "metadata" | "dollar_prefix";
  taskText: string;
  entry?: SkillCatalogEntry;
  diagnostic?: SkillDiagnostic;
}
