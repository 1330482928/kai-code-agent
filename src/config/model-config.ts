import { mkdir, readFile, stat, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { parse, stringify } from "yaml";
import { z } from "zod";

import { redactSecret } from "../ui/secrets.js";

export const modelProfileSchema = z.object({
  preset: z.string().min(1),
  provider: z.string().min(1),
  baseURL: z.string().min(1),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export const modelConfigSchema = z.object({
  version: z.literal(1),
  defaultModel: z.string().min(1),
  models: z.record(modelProfileSchema),
});

export type ModelProfile = z.infer<typeof modelProfileSchema>;
export type ModelConfig = z.infer<typeof modelConfigSchema>;

export type LoadModelConfigResult =
  | { status: "ok"; configPath: string; config: ModelConfig; profileId: string; profile: ModelProfile }
  | { status: "missing"; configPath: string }
  | { status: "invalid"; configPath: string; error: Error };

export interface ModelConfigPathOptions {
  configPath?: string;
  homeDir?: string;
}

export function getDefaultModelConfigPath(options: ModelConfigPathOptions = {}): string {
  if (options.configPath) {
    return options.configPath;
  }
  return path.join(options.homeDir ?? homedir(), ".kai-code-agent", "config.yaml");
}

export function parseModelConfig(input: unknown): ModelConfig {
  return modelConfigSchema.parse(input);
}

export function getDefaultModelProfile(config: ModelConfig): {
  profileId: string;
  profile: ModelProfile;
} | null {
  const profile = config.models[config.defaultModel];
  if (!profile) {
    return null;
  }
  return {
    profileId: config.defaultModel,
    profile,
  };
}

export async function loadModelConfig(
  options: ModelConfigPathOptions = {},
): Promise<LoadModelConfigResult> {
  const configPath = getDefaultModelConfigPath(options);

  try {
    await stat(configPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { status: "missing", configPath };
    }
    return { status: "invalid", configPath, error: asError(error) };
  }

  try {
    const text = await readFile(configPath, "utf8");
    const parsed = parse(text);
    const config = parseModelConfig(parsed);
    const defaultProfile = getDefaultModelProfile(config);

    if (!defaultProfile) {
      return {
        status: "invalid",
        configPath,
        error: new Error(`defaultModel '${config.defaultModel}' does not reference a model profile`),
      };
    }

    return {
      status: "ok",
      configPath,
      config,
      profileId: defaultProfile.profileId,
      profile: defaultProfile.profile,
    };
  } catch (error) {
    return { status: "invalid", configPath, error: asError(error) };
  }
}

export async function saveModelConfig(
  config: ModelConfig,
  options: ModelConfigPathOptions = {},
): Promise<string> {
  const configPath = getDefaultModelConfigPath(options);
  parseModelConfig(config);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, stringify(config), { encoding: "utf8", mode: 0o600 });

  try {
    await chmod(configPath, 0o600);
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }
  }

  return configPath;
}

export function redactApiKey(apiKey: string): string {
  return redactSecret(apiKey);
}

export function formatModelConfigForDisplay(config: ModelConfig): string {
  const defaultProfile = getDefaultModelProfile(config);
  if (!defaultProfile) {
    throw new Error(`defaultModel '${config.defaultModel}' does not reference a model profile`);
  }

  const { profileId, profile } = defaultProfile;
  return [
    `Default model: ${profileId}`,
    `Preset: ${profile.preset}`,
    `Provider: ${profile.provider}`,
    `Base URL: ${profile.baseURL}`,
    `Model: ${profile.model}`,
    `API key: ${redactApiKey(profile.apiKey)}`,
  ].join("\n");
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
