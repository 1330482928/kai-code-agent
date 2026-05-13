import { describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { main, saveModelConfig, SECRET_MASK, type ModelConfig } from "../src/index.js";

describe("stage 01 CLI", () => {
  it("exports the CLI entrypoint", () => {
    expect(typeof main).toBe("function");
  });

  it("runs fixture provider replay through the CLI", async () => {
    const stdout = createWritableCollector();

    await main(
      [
        "run",
        "--provider",
        "fixture",
        "--script",
        path.join(process.cwd(), "fixtures/provider/basic-text.json"),
        "hello",
      ],
      { stdout: stdout.stream },
    );

    expect(stdout.output()).toBe("Hello from fixture.\n");
  });

  it("shows config with a redacted API key", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-cli-test-"));
    const configPath = path.join(dir, ".kai-code-agent", "config.yaml");
    const stdout = createWritableCollector();

    try {
      await saveModelConfig(sampleConfig(), { configPath });

      await main(["config", "show"], { configPath, stdout: stdout.stream });

      expect(stdout.output()).toContain("Default model: minimax-global");
      expect(stdout.output()).toContain(`API key: ${SECRET_MASK}`);
      expect(stdout.output()).not.toContain("sk-cli-secret");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses non-TTY fallback for bare kai while preserving command output", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kai-cli-fallback-test-"));
    const configPath = path.join(dir, ".kai-code-agent", "config.yaml");
    const stdout = createWritableCollector();
    const fetchMock: typeof fetch = async () =>
      new Response(
        streamFromString(
          [
            'data: {"choices":[{"delta":{"content":"fallback ok"}}]}',
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
        ),
      );

    try {
      await saveModelConfig(sampleConfig(), { configPath });

      await main([], {
        configPath,
        stdout: stdout.stream,
        fetch: fetchMock,
        useTui: false,
        prompt: promptWithAnswers(["hello"]),
      });

      expect(stdout.output()).toContain("fallback ok\n");
      expect(stdout.output()).not.toContain("Kai model setup");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function createWritableCollector(): {
  stream: Writable;
  output(): string;
} {
  let text = "";
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        text += chunk.toString();
        callback();
      },
    }),
    output() {
      return text;
    },
  };
}

function promptWithAnswers(answers: string[]) {
  return {
    async question(prompt: string) {
      const answer = answers.shift();
      if (answer === undefined) {
        throw new Error("prompt asked for too many answers");
      }
      return answer;
    },
  };
}

function sampleConfig(): ModelConfig {
  return {
    version: 1,
    defaultModel: "minimax-global",
    models: {
      "minimax-global": {
        preset: "Minimax Global",
        provider: "openai",
        baseURL: "https://api.minimax.io/v1",
        apiKey: "sk-cli-secret",
        model: "MiniMax-Text-01",
      },
    },
  };
}

function streamFromString(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}
