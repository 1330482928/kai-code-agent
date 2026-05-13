import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";

import type { ModelConfig, ModelConfigPathOptions, ModelProfile } from "./model-config.js";
import { loadModelConfig, saveModelConfig } from "./model-config.js";

export interface ProviderPreset {
  id: string;
  label: string;
  provider: string;
  baseURL?: string;
}

export const providerPresets = [
  {
    id: "minimax-global",
    label: "Minimax Global",
    provider: "openai",
    baseURL: "https://api.minimax.io/v1",
  },
  {
    id: "custom",
    label: "Other",
    provider: "openai",
  },
] as const satisfies readonly ProviderPreset[];

export interface PromptIO {
  question(prompt: string): Promise<string>;
  close?(): void;
}

export interface EnsureModelConfigOptions extends ModelConfigPathOptions {
  prompt?: PromptIO;
  input?: Readable;
  output?: Writable;
}

export interface EnsuredModelConfig {
  configPath: string;
  config: ModelConfig;
  profileId: string;
  profile: ModelProfile;
}

export function createReadlinePromptIO(input: Readable, output: Writable): PromptIO {
  const readline = createInterface({ input, output });
  return {
    question(prompt: string) {
      return readline.question(prompt);
    },
    close() {
      readline.close();
    },
  };
}

export async function ensureModelConfig(
  options: EnsureModelConfigOptions = {},
): Promise<EnsuredModelConfig> {
  const loaded = await loadModelConfig(options);
  if (loaded.status === "ok") {
    return loaded;
  }

  const prompt = options.prompt ?? createPromptFromOptions(options);
  let shouldClose = !options.prompt;
  try {
    const config = await runFirstRunWizard(prompt);
    const configPath = await saveModelConfig(config, options);
    const profile = config.models[config.defaultModel];
    if (!profile) {
      throw new Error("first-run wizard produced an invalid default model profile");
    }

    return {
      configPath,
      config,
      profileId: config.defaultModel,
      profile,
    };
  } finally {
    if (shouldClose) {
      prompt.close?.();
    }
  }
}

export async function runFirstRunWizard(prompt: PromptIO): Promise<ModelConfig> {
  await prompt.question("No Kai model config found. Press Enter to configure a model.");
  const preset = await askPreset(prompt);
  const provider =
    preset.id === "custom"
      ? normalizeDefault(await prompt.question("Provider [openai]: "), "openai")
      : preset.provider;
  const baseURL =
    preset.baseURL ?? normalizeRequired(await prompt.question("Base URL: "), "baseURL");
  const apiKey = normalizeRequired(await prompt.question("API key: "), "apiKey");
  const model = normalizeRequired(await prompt.question("Model name: "), "model name");

  return {
    version: 1,
    defaultModel: preset.id,
    models: {
      [preset.id]: {
        preset: preset.label,
        provider,
        baseURL,
        apiKey,
        model,
      },
    },
  };
}

async function askPreset(prompt: PromptIO): Promise<ProviderPreset> {
  const choices = providerPresets
    .map((preset, index) => `${index + 1}. ${preset.label}`)
    .join("\n");
  const answer = normalizeDefault(
    await prompt.question(`Select provider preset:\n${choices}\nChoice [1]: `),
    "1",
  ).toLowerCase();

  if (answer === "1" || answer === "minimax" || answer === "minimax global") {
    return providerPresets[0];
  }
  if (answer === "2" || answer === "other" || answer === "custom") {
    return providerPresets[1];
  }
  throw new Error(`Unknown provider preset '${answer}'`);
}

function normalizeDefault(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function createPromptFromOptions(options: EnsureModelConfigOptions): PromptIO {
  if (!options.input || !options.output) {
    throw new Error("model config is missing and interactive input is unavailable");
  }
  return createReadlinePromptIO(options.input, options.output);
}
