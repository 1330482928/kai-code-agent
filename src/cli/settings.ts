import { loadSettingsLayers, describeSettingsPaths, type LoadSettingsLayersResult } from "../config/settings.js";
import type { CliOptions } from "./main.js";

export async function buildSettingsExplainReport(options: CliOptions): Promise<SettingsExplainReport> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const layers = await loadSettingsLayers({
    cwd,
    ...(env.KAI_HOME ? { homeDir: env.KAI_HOME } : env.HOME ? { homeDir: env.HOME } : {}),
  });
  const paths = await describeSettingsPaths({
    cwd,
    ...(env.KAI_HOME ? { homeDir: env.KAI_HOME } : env.HOME ? { homeDir: env.HOME } : {}),
  });
  return {
    layers,
    paths,
  };
}

export interface SettingsExplainReport {
  layers: LoadSettingsLayersResult;
  paths: Awaited<ReturnType<typeof describeSettingsPaths>>;
}

export function formatSettingsExplainReport(report: SettingsExplainReport): string {
  return [
    "Kai settings explain",
    "",
    "Settings sources:",
    ...report.paths.map((entry) => {
      const state = entry.exists ? "present" : "missing";
      const note = entry.scope === "projectLocal" ? " (gitignored)" : "";
      return `  - ${entry.scope}: ${entry.path} [${state}]${note}`;
    }),
    "",
    "Effective settings:",
    JSON.stringify(report.layers.settings, null, 2),
  ].join("\n");
}
