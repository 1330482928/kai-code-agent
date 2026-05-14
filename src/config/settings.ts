import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { JsonObject, JsonValue } from "../foundation/tool.js";

export interface RuntimeSettingsPathOptions {
  cwd?: string;
  homeDir?: string;
}

export interface LoadRuntimeSettingsResult {
  settings: JsonObject;
  loadedPaths: string[];
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
  let settings: JsonObject = {};
  const loadedPaths: string[] = [];

  for (const settingsPath of runtimeSettingsPaths(options)) {
    if (!await fileExists(settingsPath)) {
      continue;
    }
    const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as unknown;
    if (!isJsonObject(parsed)) {
      throw new Error(`Runtime settings must be a JSON object: ${settingsPath}`);
    }
    settings = mergeSettings(settings, parsed);
    loadedPaths.push(settingsPath);
  }

  return { settings, loadedPaths };
}

export function mergeSettings(base: JsonObject, override: JsonObject): JsonObject {
  const merged: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const previous = merged[key];
    if (isJsonObject(previous) && isJsonObject(value)) {
      merged[key] = mergeSettings(previous, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
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

function isJsonObject(value: JsonValue | unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
