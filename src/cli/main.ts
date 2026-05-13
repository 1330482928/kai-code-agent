import { pathToFileURL } from "node:url";
import type { Readable, Writable } from "node:stream";

import { HumanInteractionManager } from "../agent/human-interaction-manager.js";
import {
  createProfileToolRegistry,
  resolveAgentProfileName,
  type AgentProfileName,
} from "../agent/profiles.js";
import { runReactLoop } from "../agent/react-loop.js";
import { createPlanGuardMiddleware } from "../coding/plan/guard-middleware.js";
import { findActivePlanPath, PlanStore } from "../coding/plan/store.js";
import {
  buildContextItemsForRun,
  buildPromptDebugSnapshot,
  ContextManager,
  redactDebugText,
  renderPromptDebugText,
  type ContextBudget,
} from "../coding/context/index.js";
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
import { exportSessionJsonl, replaySessionPlain } from "../session/export.js";
import { getDefaultSessionDbPath } from "../session/path.js";
import { openSqliteSessionStore, type SqliteSessionStore } from "../session/sqlite-store.js";
import type { LoadedSession, PromptSubmission, SessionRecord } from "../session/types.js";
import { runChatLoop, writeChatSnapshot } from "./chat.js";
import { createInterruptBinding } from "./interrupt.js";
import { renderError } from "../ui/render.js";
import { PlainRenderer } from "../ui/plain/renderer.js";
import { promptPlainApproval } from "../ui/prompts/approval.js";
import { promptPlainQuestion } from "../ui/prompts/ask-user-question.js";
import { promptPlainPlanApproval } from "../ui/prompts/plan-approval.js";
import { runInkSetup } from "../ui/tui.js";

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
  sessionDbPath?: string;
}

interface RunCommandOptions {
  task: string;
  providerName?: string;
  scriptPath?: string;
  session?: string;
}

interface PlanCommandOptions {
  subcommand: string;
  sessionId?: string;
}

interface ResumeCommandOptions {
  sessionId: string;
  task: string;
  providerName?: string;
  scriptPath?: string;
}

interface SessionRunContext {
  store: SqliteSessionStore;
  session: SessionRecord;
  loaded?: LoadedSession;
}

interface PromptDebugCommandOptions {
  debug: boolean;
  task: string;
  sessionId?: string;
  json?: boolean;
  showItems?: boolean;
  maxInputTokens?: number;
  reservedOutputTokens?: number;
  compactThreshold?: number;
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

  if (command === "resume") {
    await handleResume(parseResumeCommand(argv.slice(1)), options);
    return;
  }

  if (command === "sessions") {
    await handleSessions(argv.slice(1), options);
    return;
  }

  if (command === "plan") {
    await handlePlan(parsePlanCommand(argv.slice(1)), options);
    return;
  }

  if (command === "prompt") {
    await handlePromptDebug(parsePromptDebugCommand(argv.slice(1)), options);
    return;
  }

  if (command === "chat") {
    await handleChat(argv.slice(1), options);
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
    throw new Error("Usage: kai run [--provider fixture --script <path>] [--session new|<id>] \"<task>\"");
  }

  const provider = await createRunProvider(command, options);
  const model = command.providerName === "fixture" ? "fixture-model" : await getConfiguredModel(options);
  const sessionContext = command.session
    ? await createSessionRunContext(command.session, options)
    : undefined;
  try {
    if (sessionContext && command.session === "new") {
      (options.stderr ?? process.stderr).write(`Session: ${sessionContext.session.id}\n`);
    }
    await runTask(command.task, model, provider, options, {
      sessionContext,
      autoApprovePlan: command.providerName === "fixture",
    });
  } finally {
    sessionContext?.store.close();
  }
}

async function handleResume(command: ResumeCommandOptions, options: CliOptions): Promise<void> {
  if (!command.sessionId || !command.task) {
    throw new Error("Usage: kai resume [--provider fixture --script <path>] <session-id> \"<task>\"");
  }

  const provider = await createRunProvider(command, options);
  const model = command.providerName === "fixture" ? "fixture-model" : await getConfiguredModel(options);
  const store = await openCliSessionStore(options);
  try {
    const loaded = store.loadSession(command.sessionId);
    if (!loaded) {
      throw new Error(`Session not found: ${command.sessionId}`);
    }
    await runTask(command.task, model, provider, options, {
      sessionContext: { store, session: loaded.session, loaded },
    });
  } finally {
    store.close();
  }
}

async function handleSessions(argv: string[], options: CliOptions): Promise<void> {
  const [subcommand, sessionId] = argv;
  const stdout = options.stdout ?? process.stdout;
  const store = await openCliSessionStore(options);
  try {
    if (!subcommand) {
      const sessions = store.listSessions();
      if (sessions.length === 0) {
        stdout.write("No sessions found.\n");
        return;
      }
      for (const session of sessions) {
        stdout.write(`${session.id}\t${session.updatedAt}\t${session.messageCount}\t${session.summary ?? session.title ?? ""}\n`);
      }
      return;
    }

    if (subcommand === "export") {
      const loaded = requireLoadedSession(store, sessionId);
      stdout.write(exportSessionJsonl(loaded));
      return;
    }

    if (subcommand === "replay") {
      const loaded = requireLoadedSession(store, sessionId);
      stdout.write(replaySessionPlain(loaded));
      return;
    }

    throw new Error("Usage: kai sessions [export|replay <session-id>]");
  } finally {
    store.close();
  }
}

async function handlePlan(command: PlanCommandOptions, options: CliOptions): Promise<void> {
  if (command.subcommand !== "open") {
    throw new Error("Usage: kai plan open --session <session-id>");
  }
  const store = await openCliSessionStore(options);
  try {
    const loaded = requireLoadedSession(store, command.sessionId);
    const planPath = findActivePlanPath(loaded);
    if (!planPath) {
      throw new Error(`No active plan found for session: ${command.sessionId}`);
    }
    const planStore = new PlanStore({ cwd: loaded.session.cwd || options.cwd || process.cwd() });
    const plan = await planStore.readPlan(planPath);
    const stdout = options.stdout ?? process.stdout;
    stdout.write(`Plan: ${plan.path}\n${plan.preview}${plan.preview.endsWith("\n") ? "" : "\n"}`);
  } finally {
    store.close();
  }
}

async function handlePromptDebug(command: PromptDebugCommandOptions, options: CliOptions): Promise<void> {
  if (!command.debug || !command.task) {
    throw new Error("Usage: kai prompt --debug [--session <id>] [--json] [--show-items] [--max-input-tokens <n>] \"<task>\"");
  }

  const stdout = options.stdout ?? process.stdout;
  const budget: Partial<ContextBudget> = {
    ...(command.maxInputTokens !== undefined ? { maxInputTokens: command.maxInputTokens } : {}),
    ...(command.reservedOutputTokens !== undefined ? { reservedOutputTokens: command.reservedOutputTokens } : {}),
    ...(command.compactThreshold !== undefined ? { compactThreshold: command.compactThreshold } : {}),
  };
  const store = command.sessionId ? await openCliSessionStore(options) : undefined;
  try {
    const loaded = command.sessionId ? requireLoadedSession(store!, command.sessionId) : undefined;
    const loadedConfig = await loadModelConfig({ configPath: resolveConfigPath(options) });
    const model = loadedConfig.status === "ok" ? loadedConfig.profile.model : "debug-model";
    const profileName = resolveAgentProfileName({ sessionMetadata: loaded?.session.metadata });
    const registry = createProfileToolRegistry({ profileName });
    const messages = [{ role: "user" as const, content: command.task }];
    const items = await buildContextItemsForRun({
      cwd: options.cwd ?? loaded?.session.cwd ?? process.cwd(),
      messages,
      loadedSession: loaded,
      profileName,
      currentUserOrdinal: 0,
    });
    const manager = new ContextManager({
      budget,
      readOnly: true,
    });
    const build = await manager.build({
      model,
      items,
      tools: registry.providerSchemas(),
      loadedSession: loaded,
      profileName,
    });
    const snapshot = buildPromptDebugSnapshot({
      build,
      showItems: command.showItems,
    });
    if (command.json) {
      stdout.write(`${redactDebugText(JSON.stringify(snapshot, null, 2))}\n`);
      return;
    }
    stdout.write(renderPromptDebugText(snapshot));
  } finally {
    store?.close();
  }
}

async function handleChat(argv: string[], options: CliOptions): Promise<void> {
  const sessionId = parseChatSession(argv);
  const store = await openCliSessionStore(options);
  try {
    if (!shouldUseTui(options)) {
      writeChatSnapshot(store, {
        sessionId,
        cwd: options.cwd ?? process.cwd(),
        stdout: options.stdout ?? process.stdout,
      });
      return;
    }

    const ensured = await ensureModelConfigForBareTui(options);
    await runChatLoop({
      store,
      sessionId,
      cwd: options.cwd ?? process.cwd(),
      model: ensured.profile.model,
      stdin: options.stdin ?? process.stdin,
      stdout: options.stdout ?? process.stdout,
      stderr: options.stderr ?? process.stderr,
      createProvider: () => createProvider(ensured.profile, { fetch: options.fetch }),
      runTurn: async ({ task, model, provider, session, loaded, submission }) => {
        await runTask(task, model, provider, options, {
          sessionContext: { store, session, loaded },
          promptSubmission: submission,
        });
      },
    });
  } finally {
    store.close();
  }
}

async function handleBareCli(options: CliOptions): Promise<void> {
  if (shouldUseTui(options)) {
    const ensured = await ensureModelConfigForBareTui(options);
    const store = await openCliSessionStore(options);
    try {
      await runChatLoop({
        store,
        cwd: options.cwd ?? process.cwd(),
        model: ensured.profile.model,
        stdin: options.stdin ?? process.stdin,
        stdout: options.stdout ?? process.stdout,
        stderr: options.stderr ?? process.stderr,
        createProvider: () => createProvider(ensured.profile, { fetch: options.fetch }),
        runTurn: async ({ task, model, provider, session, loaded, submission }) => {
          await runTask(task, model, provider, options, {
            sessionContext: { store, session, loaded },
            promptSubmission: submission,
          });
        },
      });
    } finally {
      store.close();
    }
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
  runOptions: {
    sessionContext?: SessionRunContext;
    initialMessages?: import("../foundation/message.js").Message[];
    promptSubmission?: PromptSubmission;
    autoApprovePlan?: boolean;
  } = {},
): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const renderer = new PlainRenderer({ stdout, stderr });
  const humanInteractionManager = createCliHumanInteractionManager(options);
  const interrupt = createInterruptBinding();
  let activeProfile: AgentProfileName = resolveAgentProfileName({
    promptSubmission: runOptions.promptSubmission,
    sessionMetadata: runOptions.sessionContext?.session.metadata,
  });
  const planStore = new PlanStore({ cwd: options.cwd ?? process.cwd() });
  const activePlanPath = findActivePlanPath(runOptions.sessionContext?.loaded);
  if (runOptions.sessionContext?.session.id && activePlanPath) {
    planStore.activatePlan(runOptions.sessionContext.session.id, activePlanPath);
  }
  const planRuntime = {
    store: planStore,
    humanInteractionManager,
    getProfile: () => activeProfile,
    autoApprovePlan: runOptions.autoApprovePlan,
    onUiEvent(event: import("../foundation/ui-event.js").UiEvent) {
      renderer.render(event);
    },
  };
  const registryForProfile = (profileName: AgentProfileName) => createProfileToolRegistry({
    profileName,
    humanInteractionManager,
    planRuntime,
  });
  const middleware = [
    createPlanGuardMiddleware({ getProfile: () => activeProfile }),
  ];

  try {
    await runReactLoop({
      task,
      model,
      provider,
      cwd: options.cwd ?? process.cwd(),
      sessionId: runOptions.sessionContext?.session.id,
      initialMessages: runOptions.initialMessages,
      loadedSession: runOptions.sessionContext?.loaded,
      profileName: activeProfile,
      getToolRegistryForProfile: registryForProfile,
      onProfileChange(profileName) {
        activeProfile = profileName;
      },
      promptSubmission: runOptions.promptSubmission,
      sessionRecorder: runOptions.sessionContext?.store.createRecorder(runOptions.sessionContext.session.id),
      signal: interrupt.signal,
      toolRegistry: registryForProfile(activeProfile),
      middleware,
      onUiEvent(event) {
        renderer.render(event);
      },
    });
    stdout.write("\n");
  } finally {
    interrupt.cleanup();
  }
}

function parseRunCommand(argv: string[]): RunCommandOptions {
  let providerName: string | undefined;
  let scriptPath: string | undefined;
  let session: string | undefined;
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
    if (arg === "--session") {
      session = readFlagValue(argv, index, "--session");
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
    session,
  };
}

function parsePromptDebugCommand(argv: string[]): PromptDebugCommandOptions {
  let debug = false;
  let sessionId: string | undefined;
  let json = false;
  let showItems = false;
  let maxInputTokens: number | undefined;
  let reservedOutputTokens: number | undefined;
  let compactThreshold: number | undefined;
  const taskParts: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--debug") {
      debug = true;
      continue;
    }
    if (arg === "--session") {
      sessionId = readFlagValue(argv, index, "--session");
      index += 1;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--show-items") {
      showItems = true;
      continue;
    }
    if (arg === "--max-input-tokens") {
      maxInputTokens = parseNumberFlag(readFlagValue(argv, index, "--max-input-tokens"), "--max-input-tokens");
      index += 1;
      continue;
    }
    if (arg === "--reserved-output-tokens") {
      reservedOutputTokens = parseNumberFlag(readFlagValue(argv, index, "--reserved-output-tokens"), "--reserved-output-tokens");
      index += 1;
      continue;
    }
    if (arg === "--compact-threshold") {
      compactThreshold = parseNumberFlag(readFlagValue(argv, index, "--compact-threshold"), "--compact-threshold");
      index += 1;
      continue;
    }
    if (arg) {
      taskParts.push(arg);
    }
  }

  return {
    debug,
    task: taskParts.join(" ").trim(),
    ...(sessionId ? { sessionId } : {}),
    ...(json ? { json } : {}),
    ...(showItems ? { showItems } : {}),
    ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
    ...(reservedOutputTokens !== undefined ? { reservedOutputTokens } : {}),
    ...(compactThreshold !== undefined ? { compactThreshold } : {}),
  };
}

function parseResumeCommand(argv: string[]): ResumeCommandOptions {
  let providerName: string | undefined;
  let scriptPath: string | undefined;
  const positional: string[] = [];

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
      positional.push(arg);
    }
  }

  const [sessionId, ...taskParts] = positional;
  return {
    sessionId: sessionId ?? "",
    task: taskParts.join(" ").trim(),
    providerName,
    scriptPath,
  };
}

function parseChatSession(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--session") {
      return readFlagValue(argv, index, "--session");
    }
  }
  return undefined;
}

function parsePlanCommand(argv: string[]): PlanCommandOptions {
  const [subcommand = ""] = argv;
  let sessionId: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--session") {
      sessionId = readFlagValue(argv, index, "--session");
      index += 1;
    }
  }
  return { subcommand, sessionId };
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseNumberFlag(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} requires a non-negative number`);
  }
  return parsed;
}

function resolveConfigPath(options: CliOptions): string | undefined {
  return options.configPath ?? options.env?.KAI_CONFIG_PATH ?? process.env.KAI_CONFIG_PATH;
}

async function openCliSessionStore(options: CliOptions): Promise<SqliteSessionStore> {
  return openSqliteSessionStore(getDefaultSessionDbPath({
    env: options.env,
    sessionDbPath: options.sessionDbPath,
  }));
}

async function createSessionRunContext(sessionOption: string, options: CliOptions): Promise<SessionRunContext> {
  const store = await openCliSessionStore(options);
  if (sessionOption === "new") {
    return {
      store,
      session: store.createSession({ cwd: options.cwd ?? process.cwd() }),
    };
  }
  const loaded = store.loadSession(sessionOption);
  if (!loaded) {
    store.close();
    throw new Error(`Session not found: ${sessionOption}`);
  }
  return {
    store,
    session: loaded.session,
    loaded,
  };
}

function requireLoadedSession(store: SqliteSessionStore, sessionId: string | undefined): LoadedSession {
  if (!sessionId) {
    throw new Error("Session id is required");
  }
  const loaded = store.loadSession(sessionId);
  if (!loaded) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return loaded;
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

function createCliHumanInteractionManager(options: CliOptions): HumanInteractionManager | undefined {
  if (!shouldUseInteractivePrompt(options)) {
    return undefined;
  }

  const manager = new HumanInteractionManager();
  manager.onRequest(async (request) => {
    const prompt = options.prompt ?? createReadlinePromptIO(
      options.stdin ?? process.stdin,
      options.stdout ?? process.stdout,
    );
    const shouldClose = !options.prompt;
    try {
      if (request.type === "approval") {
        manager.resolveApproval(request.id, await promptPlainApproval(prompt, request));
        return;
      }
      if (request.type === "plan_approval") {
        manager.resolvePlanApproval(request.id, await promptPlainPlanApproval(prompt, request));
        return;
      }
      manager.resolveQuestion(request.id, await promptPlainQuestion(prompt, request.questions));
    } catch (error) {
      manager.reject(request.id, error);
    } finally {
      if (shouldClose) {
        prompt.close?.();
      }
    }
  });
  return manager;
}

function shouldUseInteractivePrompt(options: CliOptions): boolean {
  if (options.prompt) {
    return true;
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
