import { providerPresets, type ProviderPreset } from "../config/first-run.js";
import type { ModelConfig } from "../config/model-config.js";

export type SetupStep = "preset" | "provider" | "baseURL" | "apiKey" | "model" | "confirm";

export interface SetupDraft {
  presetId: string;
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface SetupState {
  step: SetupStep;
  presetIndex: number;
  draft: SetupDraft;
}

export function createSetupState(): SetupState {
  const preset = getPresetAt(0);
  return {
    step: "preset",
    presetIndex: 0,
    draft: {
      presetId: preset.id,
      provider: preset.provider,
      baseURL: preset.baseURL ?? "",
      apiKey: "",
      model: "",
    },
  };
}

export function selectPreset(state: SetupState, presetIndex: number): SetupState {
  const clamped = clampPresetIndex(presetIndex);
  const preset = getPresetAt(clamped);
  return {
    ...state,
    presetIndex: clamped,
    draft: {
      ...state.draft,
      presetId: preset.id,
      provider: preset.provider,
      baseURL: preset.baseURL ?? "",
    },
  };
}

export function selectedPreset(state: SetupState): ProviderPreset {
  return getPresetAt(state.presetIndex);
}

export function nextSetupStep(step: SetupStep, draft: SetupDraft): SetupStep {
  if (step === "preset") {
    return draft.presetId === "custom" ? "provider" : "apiKey";
  }
  if (step === "provider") {
    return "baseURL";
  }
  if (step === "baseURL") {
    return "apiKey";
  }
  if (step === "apiKey") {
    return "model";
  }
  if (step === "model") {
    return "confirm";
  }
  return "confirm";
}

export function updateSetupDraft(
  draft: SetupDraft,
  field: keyof SetupDraft,
  value: string,
): SetupDraft {
  return {
    ...draft,
    [field]: value,
  };
}

export function buildModelConfigFromSetupDraft(draft: SetupDraft): ModelConfig {
  const preset = providerPresets.find((candidate) => candidate.id === draft.presetId);
  if (!preset) {
    throw new Error(`Unknown provider preset '${draft.presetId}'`);
  }

  const provider = normalizeDefault(draft.provider, "openai");
  const baseURL = normalizeRequired(draft.baseURL, "baseURL");
  const apiKey = normalizeRequired(draft.apiKey, "apiKey");
  const model = normalizeRequired(draft.model, "model name");

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

export function validateSetupField(step: SetupStep, value: string): string | null {
  if (step === "provider") {
    return null;
  }
  if (step === "baseURL" && value.trim().length === 0) {
    return "Base URL is required";
  }
  if (step === "apiKey" && value.trim().length === 0) {
    return "API key is required";
  }
  if (step === "model" && value.trim().length === 0) {
    return "Model name is required";
  }
  return null;
}

function clampPresetIndex(index: number): number {
  if (index < 0) {
    return providerPresets.length - 1;
  }
  if (index >= providerPresets.length) {
    return 0;
  }
  return index;
}

function getPresetAt(index: number): ProviderPreset {
  const preset = providerPresets[index] as ProviderPreset | undefined;
  if (preset) {
    return preset;
  }
  return providerPresets[0] as ProviderPreset;
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
