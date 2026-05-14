import type { JsonObject } from "../foundation/tool.js";

export type AgentDiagnosticSeverity = "warning" | "error";

export interface AgentDiagnostic {
  severity: AgentDiagnosticSeverity;
  message: string;
  path?: string;
  name?: string;
}

export interface AgentMetadata {
  name: string;
  normalizedName: string;
  description: string;
  prompt: string;
  tools: string[];
  skills?: string[];
  maxTurns?: number;
}

export interface ParsedAgentMarkdown {
  metadata: AgentMetadata;
  bodyPreview: string;
  diagnostics: AgentDiagnostic[];
}

export interface AgentDirectory {
  path: string;
  label: string;
}

export interface DiscoveredAgent {
  name: string;
  normalizedName: string;
  description: string;
  prompt: string;
  tools: string[];
  skills?: string[];
  maxTurns?: number;
  sourcePath: string;
  bodyPreview: string;
  diagnostics: AgentDiagnostic[];
  directoryLabel: string;
}

export interface AgentCatalogEntry {
  name: string;
  normalizedName: string;
  description: string;
  prompt: string;
  tools: string[];
  sourcePath: string;
  bodyPreview: string;
  directoryLabel: string;
  skills?: string[];
  maxTurns?: number;
  diagnostics?: AgentDiagnostic[];
}

export interface AgentCatalog {
  selected: AgentCatalogEntry[];
  all: AgentCatalogEntry[];
  diagnostics: AgentDiagnostic[];
}

export interface AgentRunResult {
  agentName: string;
  sideTranscriptId: string;
  summary: string;
  changedFiles: string[];
  openQuestions: string[];
  metadata?: JsonObject;
}

export interface AgentRunRuntime {
  provider: import("../provider/types.js").ProviderAdapter;
  model: string;
  cwd: string;
  sessionId: string;
  toolRegistry?: import("../coding/tools/registry.js").ToolRegistry;
  sessionDbPath?: string;
  homeDir?: string;
}

