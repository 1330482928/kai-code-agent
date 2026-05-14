import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { JsonObject, JsonValue } from "../foundation/tool.js";
import { mergeSettings as mergeSettingsObject } from "./settings-merge.js";

export interface RuntimeSettingsPathOptions {
  cwd?: string;
  homeDir?: string;
}

export interface LoadRuntimeSettingsResult {
  settings: JsonObject;
  loadedPaths: string[];
}

export interface SettingsLayer {
  scope: "user" | "project" | "projectLocal";
  path: string;
  settings: JsonObject;
}

export interface SettingsPathEntry {
  scope: "user" | "project" | "projectLocal";
  path: string;
  exists: boolean;
}

export interface LoadSettingsLayersResult {
  layers: SettingsLayer[];
  settings: JsonObject;
}

export function runtimeSettingsPaths(options: RuntimeSettingsPathOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const home = options.homeDir ?? homedir();
  return [
    path.join(home, ".kai-code-agent", "settings.json"),
    path.join(cwd, ".kai", "settings.json"),
    path.join(cwd, ".kai", "settings.local.json"),
  ];
}

export async function loadRuntimeSettings(
  options: RuntimeSettingsPathOptions = {},
): Promise<LoadRuntimeSettingsResult> {
  const loaded = await loadSettingsLayers(options);
  return {
    settings: loaded.settings,
    loadedPaths: loaded.layers.map((layer) => layer.path),
  };
}

export async function loadSettingsLayers(
  options: RuntimeSettingsPathOptions = {},
): Promise<LoadSettingsLayersResult> {
  const layers: SettingsLayer[] = [];
  for (const { scope, path: settingsPath } of settingsPaths(options)) {
    if (!await fileExists(settingsPath)) {
      continue;
    }
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as unknown;
    if (!isJsonObject(parsed)) {
      throw new Error(`Runtime settings must be a JSON object: ${settingsPath}`);
    }
    layers.push({ scope, path: settingsPath, settings: parsed });
  }
  const settings = layers.reduce((merged, layer) => mergeSettingsObject(merged, layer.settings), {} as JsonObject);
  return { layers, settings };
}

export async function describeSettingsPaths(
  options: RuntimeSettingsPathOptions = {},
): Promise<SettingsPathEntry[]> {
  const entries = settingsPaths(options);
  return Promise.all(entries.map(async (entry) => ({
    ...entry,
    exists: await fileExists(entry.path),
  })));
}

export async function saveSettingsScope(
  scope: "user" | "project" | "projectLocal",
  settings: JsonObject,
  options: RuntimeSettingsPathOptions = {},
): Promise<string> {
  const target = settingsPaths(options).find((entry) => entry.scope === scope);
  if (!target) {
    throw new Error(`Unknown settings scope '${scope}'`);
  }
  if (target.scope !== "user") {
    await mkdir(path.dirname(target.path), { recursive: true });
  } else {
    await mkdir(path.dirname(target.path), { recursive: true });
  }
  await writeFile(target.path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return target.path;
}

export function mergeSettings(base: JsonObject, override: JsonObject): JsonObject {
  return mergeSettingsObject(base, override);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function settingsPaths(options: RuntimeSettingsPathOptions): Array<{ scope: "user" | "project" | "projectLocal"; path: string }> {
  const cwd = options.cwd ?? process.cwd();
  const home = options.homeDir ?? homedir();
  return [
    { scope: "user", path: path.join(home, ".kai-code-agent", "settings.json") },
    { scope: "project", path: path.join(cwd, ".kai", "settings.json") },
    { scope: "projectLocal", path: path.join(cwd, ".kai", "settings.local.json") },
  ];
}

function isJsonObject(value: JsonValue | unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
