import { describe, expect, it } from "vitest";

import {
  buildModelConfigFromSetupDraft,
  createSetupState,
  maskSecret,
  nextSetupStep,
  redactSecret,
  SECRET_MASK,
  selectPreset,
  updateSetupDraft,
  validateSetupField,
} from "../src/index.js";

describe("secret masking", () => {
  it("returns a fixed mask for non-empty secrets", () => {
    expect(maskSecret("sk-test-secret")).toBe(SECRET_MASK);
    expect(redactSecret("sk-test-secret")).toBe(SECRET_MASK);
    expect(maskSecret("")).toBe("");
    expect(redactSecret("")).toBe("<empty>");
  });
});

describe("setup state", () => {
  it("moves through the Minimax setup path and preserves the real API key", () => {
    let state = createSetupState();
    expect(state.step).toBe("preset");
    expect(nextSetupStep(state.step, state.draft)).toBe("apiKey");

    let draft = updateSetupDraft(state.draft, "apiKey", "sk-state-secret");
    expect(nextSetupStep("apiKey", draft)).toBe("model");
    draft = updateSetupDraft(draft, "model", "MiniMax-M2.7");

    const config = buildModelConfigFromSetupDraft(draft);
    const profile = config.models["minimax-global"];

    expect(profile?.apiKey).toBe("sk-state-secret");
    expect(profile?.apiKey).not.toBe(SECRET_MASK);
    expect(profile?.baseURL).toBe("https://api.minimax.io/v1");
  });

  it("moves through the custom setup path and defaults provider to openai", () => {
    let state = selectPreset(createSetupState(), 1);
    expect(state.draft.presetId).toBe("custom");
    expect(nextSetupStep(state.step, state.draft)).toBe("provider");

    let draft = updateSetupDraft(state.draft, "provider", "");
    draft = updateSetupDraft(draft, "baseURL", "https://example.test/v1");
    draft = updateSetupDraft(draft, "apiKey", "sk-custom-secret");
    draft = updateSetupDraft(draft, "model", "custom-model");

    const config = buildModelConfigFromSetupDraft(draft);
    const profile = config.models["custom"];

    expect(profile?.provider).toBe("openai");
    expect(profile?.baseURL).toBe("https://example.test/v1");
    expect(profile?.apiKey).toBe("sk-custom-secret");
  });

  it("validates required setup fields", () => {
    expect(validateSetupField("apiKey", "")).toBe("API key is required");
    expect(validateSetupField("model", "")).toBe("Model name is required");
    expect(validateSetupField("baseURL", "")).toBe("Base URL is required");
    expect(validateSetupField("provider", "")).toBeNull();
  });
});
