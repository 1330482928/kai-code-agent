import { pathToFileURL } from "node:url";
import type { Readable, Writable } from "node:stream";

import { runOnce } from "../agent/loop.js";
import { createReadlinePromptIO, ensureModelConfig, type PromptIO } from "../config/first-run.js";
import {
  formatModelConfigForDisplay,
  loadModelConfig,
  saveModelConfig,
  type ModelConfigPathOptions,
} from "../config/model-config.js";
import { createProvider } from "../provider/factory.js";
import { FixtureProvider } from "../provider/fixture.js";
import type { ProviderAdapter } from "../provider/types.js";
import { renderError, renderProviderEvent } from "../ui/render.js";
import { runInkSetup, runInkTaskEntry } from "../ui/tui.js";

export interface CliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: Readable;
  stdout?: Writable;
  stderr?: Writable;
  configPath?: string;
  fetch?: typeof fetch;
  useTui?: boolean;
  prompt?: PromptIO;
}

interface RunCommandOptions {
  task: string;
  providerName?: string;
  scriptPath?: string;
}

export async function main(
  argv = process.argv.slice(2),
  options: CliOptions = {},
): Promise<void> {
  await runCli(argv, options);
}

export async function runCli(
  argv = process.argv.slice(2),
  options: CliOptions = {},
): Promise<void> {
  const [command] = argv;
  const stdout = options.stdout ?? process.stdout;

  if (command === "version" || command === "--version" || command === "-v") {
    stdout.write("kai-code-agent 0.0.0\n");
    return;
  }

  if (command === "config") {
    await handleConfig(argv.slice(1), options);
    return;
  }

  if (command === "run") {
    await handleRun(parseRunCommand(argv.slice(1)), options);
    return;
  }

  if (!command) {
    await handleBareCli(options);
    return;
  }

  throw new Error(`Unknown command '${command}'`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    renderError(error);
    process.exitCode = 1;
  });
}

async function handleConfig(argv: string[], options: CliOptions): Promise<void> {
  const [subcommand] = argv;
  if (subcommand !== "show") {
    throw new Error("Usage: kai config show");
  }

  const loaded = await loadModelConfig({ configPath: resolveConfigPath(options) });
  if (loaded.status === "missing") {
    throw new Error(`No model config found at ${loaded.configPath}`);
  }
  if (loaded.status === "invalid") {
    throw loaded.error;
  }

  const stdout = options.stdout ?? process.stdout;
  stdout.write(`${formatModelConfigForDisplay(loaded.config)}\n`);
}

async function handleRun(command: RunCommandOptions, options: CliOptions): Promise<void> {
  if (!command.task) {
    throw new Error("Usage: kai run [--provider fixture --script <path>] \"<task>\"");
  }

  const provider = await createRunProvider(command, options);
  const model = command.providerName === "fixture" ? "fixture-model" : await getConfiguredModel(options);
  await runTask(command.task, model, provider, options);
}

async function handleBareCli(options: CliOptions): Promise<void> {
  if (shouldUseTui(options)) {
    const ensured = await ensureModelConfigForBareTui(options);
    const task = await runInkTaskEntry(ensured.profile, {
      stdin: options.stdin ?? process.stdin,
      stdout: options.stdout ?? process.stdout,
      stderr: options.stderr ?? process.stderr,
    });
    const provider = createProvider(ensured.profile, { fetch: options.fetch });
    await runTask(task, ensured.profile.model, provider, options);
    return;
  }

  await handleBareCliFallback(options);
}

async function createRunProvider(
  command: RunCommandOptions,
  options: CliOptions,
): Promise<ProviderAdapter> {
  if (command.providerName === "fixture") {
    if (!command.scriptPath) {
      throw new Error("Fixture provider requires --script <path>");
    }
    return FixtureProvider.fromFile(command.scriptPath);
  }

  if (command.providerName && command.providerName !== "fixture") {
    throw new Error(`Unsupported CLI provider override '${command.providerName}'`);
  }

  const prompt = options.prompt ?? createReadlinePromptIO(options.stdin ?? process.stdin, options.stdout ?? process.stdout);
  const shouldClose = !options.prompt;
  try {
    const ensured = await ensureModelConfig({
      configPath: resolveConfigPath(options),
      prompt,
    });
    return createProvider(ensured.profile, { fetch: options.fetch });
  } finally {
    if (shouldClose) {
      prompt.close?.();
    }
  }
}

async function getConfiguredModel(options: CliOptions): Promise<string> {
  const loaded = await loadModelConfig({ configPath: resolveConfigPath(options) });
  if (loaded.status === "ok") {
    return loaded.profile.model;
  }
  throw new Error("Model config became unavailable while starting the run");
}

async function runTask(
  task: string,
  model: string,
  provider: ProviderAdapter,
  options: CliOptions,
): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  await runOnce({
    task,
    model,
    provider,
    onEvent(event) {
      renderProviderEvent(event, stdout);
    },
  });
  stdout.write("\n");
}

function parseRunCommand(argv: string[]): RunCommandOptions {
  let providerName: string | undefined;
  let scriptPath: string | undefined;
  const taskParts: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--provider") {
      providerName = readFlagValue(argv, index, "--provider");
      index += 1;
      continue;
    }
    if (arg === "--script") {
      scriptPath = readFlagValue(argv, index, "--script");
      index += 1;
      continue;
    }
    if (arg) {
      taskParts.push(arg);
    }
  }

  return {
    task: taskParts.join(" ").trim(),
    providerName,
    scriptPath,
  };
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function resolveConfigPath(options: CliOptions): string | undefined {
  return options.configPath ?? options.env?.KAI_CONFIG_PATH ?? process.env.KAI_CONFIG_PATH;
}

async function ensureModelConfigForBareTui(options: CliOptions) {
  const pathOptions: ModelConfigPathOptions = { configPath: resolveConfigPath(options) };
  const loaded = await loadModelConfig(pathOptions);
  if (loaded.status === "ok") {
    return loaded;
  }

  const config = await runInkSetup({
    stdin: options.stdin ?? process.stdin,
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr,
  });
  const configPath = await saveModelConfig(config, pathOptions);
  const profile = config.models[config.defaultModel];
  if (!profile) {
    throw new Error("Ink setup produced an invalid default model profile");
  }

  return {
    configPath,
    config,
    profileId: config.defaultModel,
    profile,
  };
}

async function handleBareCliFallback(options: CliOptions): Promise<void> {
  const input = options.stdin ?? process.stdin;
  const output = options.stdout ?? process.stdout;
  const prompt = options.prompt ?? createReadlinePromptIO(input, output);
  const shouldClose = !options.prompt;

  try {
    const ensured = await ensureModelConfig({
      configPath: resolveConfigPath(options),
      prompt,
    });
    const task = (await prompt.question("Task: ")).trim();
    if (!task) {
      throw new Error("Task is required");
    }
    const provider = createProvider(ensured.profile, { fetch: options.fetch });
    await runTask(task, ensured.profile.model, provider, options);
  } finally {
    if (shouldClose) {
      prompt.close?.();
    }
  }
}

function shouldUseTui(options: CliOptions): boolean {
  if (options.useTui !== undefined) {
    return options.useTui;
  }

  const env = options.env ?? process.env;
  if (env.CI === "true") {
    return false;
  }

  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  return Boolean(
    "isTTY" in stdin &&
      stdin.isTTY &&
      "isTTY" in stdout &&
      stdout.isTTY,
  );
}
