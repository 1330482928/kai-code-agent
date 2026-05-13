import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import {
  formatModelConfigForDisplay,
  loadModelConfig,
  runFirstRunWizard,
  saveModelConfig,
  SECRET_MASK,
  type ModelConfig,
  type PromptIO,
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("model configuration", () => {
  it("loads a valid default profile", async () => {
    const configPath = await createTempConfigPath();
    const config = sampleConfig("sk-valid-load");

    await saveModelConfig(config, { configPath });
    const loaded = await loadModelConfig({ configPath });

    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.profileId).toBe("minimax-global");
      expect(loaded.profile.model).toBe("MiniMax-Text-01");
    }
  });

  it("reports missing and invalid default profiles", async () => {
    const missingPath = await createTempConfigPath();
    await expect(loadModelConfig({ configPath: missingPath })).resolves.toMatchObject({
      status: "missing",
    });

    const invalidPath = await createTempConfigPath();
    await mkdir(path.dirname(invalidPath), { recursive: true });
    await writeFile(
      invalidPath,
      stringify({
        ...sampleConfig("sk-invalid-default"),
        defaultModel: "missing-profile",
      }),
    );

    const invalid = await loadModelConfig({ configPath: invalidPath });
    expect(invalid.status).toBe("invalid");
  });

  it("builds first-run config for Minimax Global and Other presets", async () => {
    const minimax = await runFirstRunWizard(promptWithAnswers(["", "1", "sk-mini", "MiniMax-Text-01"]));
    expect(minimax.defaultModel).toBe("minimax-global");
    expect(minimax.models["minimax-global"]).toMatchObject({
      preset: "Minimax Global",
      provider: "openai",
      baseURL: "https://api.minimax.io/v1",
      apiKey: "sk-mini",
      model: "MiniMax-Text-01",
    });

    const other = await runFirstRunWizard(
      promptWithAnswers(["", "2", "", "https://example.test/v1", "sk-other", "custom-model"]),
    );
    expect(other.defaultModel).toBe("custom");
    expect(other.models["custom"]).toMatchObject({
      preset: "Other",
      provider: "openai",
      baseURL: "https://example.test/v1",
      apiKey: "sk-other",
      model: "custom-model",
    });
  });

  it("saves config with secure permissions where supported", async () => {
    const configPath = await createTempConfigPath();

    await saveModelConfig(sampleConfig("sk-secure"), { configPath });

    if (process.platform !== "win32") {
      const mode = (await stat(configPath)).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it("redacts API keys in display output", () => {
    const display = formatModelConfigForDisplay(sampleConfig("sk-secret-value"));

    expect(display).toContain("Default model: minimax-global");
    expect(display).toContain(`API key: ${SECRET_MASK}`);
    expect(display).not.toContain("sk-secret-value");
  });
});

async function createTempConfigPath(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "kai-config-test-"));
  tempDirs.push(dir);
  return path.join(dir, ".kai-code-agent", "config.yaml");
}

function sampleConfig(apiKey: string): ModelConfig {
  return {
    version: 1,
    defaultModel: "minimax-global",
    models: {
      "minimax-global": {
        preset: "Minimax Global",
        provider: "openai",
        baseURL: "https://api.minimax.io/v1",
        apiKey,
        model: "MiniMax-Text-01",
      },
    },
  };
}

function promptWithAnswers(answers: string[]): PromptIO {
  return {
    async question() {
      const answer = answers.shift();
      if (answer === undefined) {
        throw new Error("prompt asked for too many answers");
      }
      return answer;
    },
  };
}
