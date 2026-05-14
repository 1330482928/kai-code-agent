import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import type { Readable, Writable } from "node:stream";

import { HumanInteractionManager } from "../agent/human-interaction-manager.js";
import {
  createProfileToolRegistry,
  resolveAgentProfileName,
  type AgentProfileName,
} from "../agent/profiles.js";
import { runReactLoop } from "../agent/react-loop.js";
import { findActivePlanPath, PlanStore } from "../coding/plan/store.js";
import {
  buildContextItemsForRun,
  buildPromptDebugSnapshot,
  ContextManager,
  redactDebugText,
  renderPromptDebugText,
  type ContextBudget,
} from "../coding/context/index.js";
import {
  buildContextQualityArtifacts,
  defaultContextTuningRules,
  diffContextDebugSnapshots,
  evaluateContextQualityFixture,
  formatContextTuningReport,
  normalizeContextEvalFixture,
  replayLoadedSessionContext,
  renderContextDebugDiff,
  renderContextTrace,
  snapshotFromTrace,
} from "../coding/context/quality/index.js";
import { createReadlinePromptIO, ensureModelConfig, runFirstRunWizard, type PromptIO } from "../config/first-run.js";
import {
  formatModelConfigForDisplay,
  getDefaultModelConfigPath,
  loadModelConfig,
  saveModelConfig,
  type ModelConfigPathOptions,
} from "../config/model-config.js";
import {
  adaptMcpTools,
  formatMcpListServerHeader,
  formatMcpListTool,
  loadMcpConfig,
  McpClientManager,
  mcpErrorMessage,
  redactMcpText,
  type McpServerConfig,
  type McpToolAdapterResult,
} from "../mcp/index.js";
import { createProvider } from "../provider/factory.js";
import { FixtureProvider } from "../provider/fixture.js";
import type { ProviderAdapter } from "../provider/types.js";
import { createPermissionMiddleware } from "../permissions/index.js";
import type { PermissionProfileName } from "../permissions/index.js";
import {
  buildSubAgentContextItems,
  createSubAgentToolMailbox,
  discoverAgents,
  formatAgentCatalogList,
  createSubAgentTool,
} from "../agents/index.js";
import {
  createMemoryMiddleware,
  buildMemoryVisibilityContext,
  getDefaultMemoryDbPath,
  MemoryGovernance,
  openSqliteMemoryStore,
  type MemoryRecord,
  type MemoryScope,
  type MemorySearchResult,
  type MemoryType,
  type SqliteMemoryStore,
} from "../memory/index.js";
import { createDebugJsonlLogger } from "./debug-jsonl.js";
import { runDoctor, formatDoctorReport } from "./doctor.js";
import { formatKaiHelpText } from "./help.js";
import { buildSettingsExplainReport, formatSettingsExplainReport } from "./settings.js";
import { formatTaskList, formatTaskRead, listTasks, readTask } from "./tasks.js";
import { exportSessionJsonl, replaySessionPlain } from "../session/export.js";
import { getDefaultSessionDbPath } from "../session/path.js";
import { openSqliteSessionStore, type SqliteSessionStore } from "../session/sqlite-store.js";
import type { LoadedSession, PromptSubmission, SessionRecord } from "../session/types.js";
import { createSkillsMiddleware, formatSkillCatalogList, loadSkillCatalog } from "../skills/index.js";
import { runChatLoop, writeChatSnapshot } from "./chat.js";
import { createInterruptBinding } from "./interrupt.js";
import { renderError } from "../ui/render.js";
import { PlainRenderer } from "../ui/plain/renderer.js";
import { promptPlainApproval } from "../ui/prompts/approval.js";
import { promptPlainQuestion } from "../ui/prompts/ask-user-question.js";
import { promptPlainPlanApproval } from "../ui/prompts/plan-approval.js";
import { runInkSetup } from "../ui/tui.js";
import type { ToolDef } from "../foundation/tool.js";

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
  memoryDbPath?: string;
}

interface RunCommandOptions {
  task: string;
  providerName?: string;
  scriptPath?: string;
  session?: string;
  permissionProfile?: PermissionProfileName;
}

interface PlanCommandOptions {
  subcommand: string;
  sessionId?: string;
}

interface MemoryCommandBase {
  subcommand: "add" | "list" | "search" | "delete" | "archive" | "refresh" | "merge" | "promote" | "extract" | "explain";
  scope?: MemoryScope;
  type?: MemoryType;
  sessionId?: string;
  write?: boolean;
}

interface MemoryAddCommand extends MemoryCommandBase {
  subcommand: "add";
  scope: MemoryScope;
  type: MemoryType;
  text: string;
}

interface MemoryListCommand extends MemoryCommandBase {
  subcommand: "list";
}

interface MemorySearchCommand extends MemoryCommandBase {
  subcommand: "search";
  query: string;
  limit?: number;
}

interface MemoryDeleteCommand extends MemoryCommandBase {
  subcommand: "delete";
  id: string;
}

interface MemoryArchiveCommand extends MemoryCommandBase {
  subcommand: "archive";
  id: string;
}

interface MemoryRefreshCommand extends MemoryCommandBase {
  subcommand: "refresh";
  id: string;
}

interface MemoryMergeCommand extends MemoryCommandBase {
  subcommand: "merge";
  primaryId: string;
  duplicateIds: string[];
}

interface MemoryPromoteCommand extends MemoryCommandBase {
  subcommand: "promote";
  id: string;
  scope: MemoryScope;
}

interface MemoryExtractCommand extends MemoryCommandBase {
  subcommand: "extract";
  sessionId: string;
  write?: boolean;
}

interface MemoryExplainCommand extends MemoryCommandBase {
  subcommand: "explain";
  query: string;
  limit?: number;
}

type MemoryCommand =
  | MemoryAddCommand
  | MemoryListCommand
  | MemorySearchCommand
  | MemoryDeleteCommand
  | MemoryArchiveCommand
  | MemoryRefreshCommand
  | MemoryMergeCommand
  | MemoryPromoteCommand
  | MemoryExtractCommand
  | MemoryExplainCommand;

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

interface ContextTraceCommandOptions {
  subcommand: "trace";
  sessionId: string;
}

interface ContextReplayCommandOptions {
  subcommand: "replay";
  sessionId: string;
}

interface ContextEvalCommandOptions {
  subcommand: "eval";
  fixturePath: string;
}

interface ContextTuneCommandOptions {
  subcommand: "tune";
  fixturePath: string;
}

interface ContextDiffCommandOptions {
  subcommand: "diff";
  sessionA: string;
  sessionB: string;
}

type ContextCommandOptions =
  | ContextTraceCommandOptions
  | ContextReplayCommandOptions
  | ContextEvalCommandOptions
  | ContextTuneCommandOptions
  | ContextDiffCommandOptions;

interface CliMcpRuntime {
  manager: McpClientManager;
  servers: McpServerConfig[];
  tools: McpToolAdapterResult[];
  externalTools: ToolDef[];
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

  if (command === "help" || command === "--help" || command === "-h") {
    stdout.write(`${formatKaiHelpText()}\n`);
    return;
  }

  if (command === "init") {
    await handleInit(options);
    return;
  }

  if (command === "doctor") {
    await handleDoctor(options);
    return;
  }

  if (command === "settings") {
    await handleSettings(argv.slice(1), options);
    return;
  }

  if (command === "tasks") {
    await handleTasks(argv.slice(1), options);
    return;
  }

  if (command === "config") {
    await handleConfig(argv.slice(1), options);
    return;
  }

  if (command === "mcp") {
    await handleMcp(argv.slice(1), options);
    return;
  }

  if (command === "skills") {
    await handleSkills(argv.slice(1), options);
    return;
  }

  if (command === "agents") {
    await handleAgents(argv.slice(1), options);
    return;
  }

  if (command === "memory") {
    await handleMemory(argv.slice(1), options);
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

  if (command === "context") {
    await handleContext(argv.slice(1), options);
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

async function handleInit(options: CliOptions): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const loaded = await loadModelConfig({ configPath: resolveConfigPath(options) });
  if (loaded.status === "ok") {
    stdout.write(`Model config already exists at ${loaded.configPath}\n`);
    return;
  }

  const prompt = options.prompt ?? createReadlinePromptIO(options.stdin ?? process.stdin, options.stdout ?? process.stdout);
  const shouldClose = !options.prompt;
  try {
    const config = await runFirstRunWizard(prompt);
    const configPath = await saveModelConfig(config, { configPath: resolveConfigPath(options) });
    stdout.write(`Model config written to ${configPath}\n`);
  } finally {
    if (shouldClose) {
      prompt.close?.();
    }
  }
}

async function handleDoctor(options: CliOptions): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const report = await runDoctor(options);
  stdout.write(`${formatDoctorReport(report)}\n`);
}

async function handleSettings(argv: string[], options: CliOptions): Promise<void> {
  const [subcommand] = argv;
  if (subcommand !== "explain") {
    throw new Error("Usage: kai settings explain");
  }
  const stdout = options.stdout ?? process.stdout;
  const report = await buildSettingsExplainReport(options);
  stdout.write(`${formatSettingsExplainReport(report)}\n`);
}

async function handleTasks(argv: string[], options: CliOptions): Promise<void> {
  const [subcommand, taskId] = argv;
  const stdout = options.stdout ?? process.stdout;
  if (subcommand === "list") {
    stdout.write(formatTaskList(await listTasks(options)));
    return;
  }
  if (subcommand === "read") {
    if (!taskId) {
      throw new Error("Usage: kai tasks read <task-id>");
    }
    stdout.write(formatTaskRead(await readTask(options, taskId)));
    return;
  }
  throw new Error("Usage: kai tasks list|read <task-id>");
}

async function handleMcp(argv: string[], options: CliOptions): Promise<void> {
  const [subcommand] = argv;
  if (subcommand !== "list") {
    throw new Error("Usage: kai mcp list");
  }

  const stdout = options.stdout ?? process.stdout;
  const loaded = await loadMcpConfig(resolveSettingsPathOptions(options));
  for (const error of loaded.errors) {
    stdout.write(`${error.serverName}\tERROR\t${error.message}\n`);
  }
  if (loaded.servers.length === 0) {
    if (loaded.errors.length === 0) {
      stdout.write("No MCP servers configured.\n");
    }
    return;
  }

  const manager = new McpClientManager({
    servers: loaded.servers,
    cwd: options.cwd ?? process.cwd(),
  });
  try {
    for (const server of loaded.servers) {
      stdout.write(`${formatMcpListServerHeader(server)}\n`);
      try {
        const tools = adaptMcpTools({
          server,
          tools: await manager.listTools(server.name),
          clientManager: manager,
        });
        for (const tool of tools) {
          stdout.write(`${formatMcpListTool(tool)}\n`);
        }
      } catch (error) {
        stdout.write(`  ERROR\t${redactMcpText(mcpErrorMessage(error), loaded.servers)}\n`);
      }
    }
  } finally {
    try {
      await manager.closeAll();
    } catch (error) {
      stdout.write(`close\tERROR\t${redactMcpText(mcpErrorMessage(error), loaded.servers)}\n`);
    }
  }
}

async function handleSkills(argv: string[], options: CliOptions): Promise<void> {
  const [subcommand, ...flags] = argv;
  if (subcommand !== "list" || flags.some((flag) => flag !== "--all")) {
    throw new Error("Usage: kai skills list [--all]");
  }

  const homeDir = resolveHomeDir(options);
  const catalog = await loadSkillCatalog({
    cwd: options.cwd ?? process.cwd(),
    ...(homeDir ? { homeDir } : {}),
  });
  const stdout = options.stdout ?? process.stdout;
  stdout.write(formatSkillCatalogList(catalog, { all: flags.includes("--all") }));
}

async function handleAgents(argv: string[], options: CliOptions): Promise<void> {
  const [subcommand, ...flags] = argv;
  if (subcommand !== "list" || flags.some((flag) => flag !== "--all")) {
    throw new Error("Usage: kai agents list [--all]");
  }

  const stdout = options.stdout ?? process.stdout;
  const catalog = await discoverAgents({
    cwd: options.cwd ?? process.cwd(),
  });
  stdout.write(formatAgentCatalogList(catalog, { all: flags.includes("--all") }));
}

async function handleMemory(argv: string[], options: CliOptions): Promise<void> {
  const command = parseMemoryCommand(argv);
  const stdout = options.stdout ?? process.stdout;
  let store: SqliteMemoryStore | undefined;
  let sessionStore: SqliteSessionStore | undefined;
  try {
    store = await openCliMemoryStore(options);
    const governance = new MemoryGovernance(store);
    if (command.subcommand === "extract") {
      sessionStore = await openCliSessionStore(options);
    }
    if (command.subcommand === "add") {
      const record = store.add({
        scope: command.scope,
        type: command.type,
        text: command.text,
        ...(command.scope === "project" || command.scope === "projectLocal"
          ? {
              projectIdentity: options.cwd ?? process.cwd(),
              projectCwd: options.cwd ?? process.cwd(),
              projectPath: options.cwd ?? process.cwd(),
            }
          : {}),
        ...(command.scope === "session"
          ? { sourceSessionId: command.sessionId }
          : {}),
      });
      stdout.write(formatMemoryAddOutput(record));
      return;
    }

    if (command.subcommand === "list") {
      const records = store.list({
        ...(command.scope ? { scope: command.scope } : {}),
        ...(command.type ? { type: command.type } : {}),
        visibility: buildMemoryVisibilityContext({
          cwd: options.cwd ?? process.cwd(),
          ...(command.sessionId ? { sessionId: command.sessionId } : {}),
        }),
      });
      stdout.write(formatMemoryRecordsOutput(records));
      return;
    }

    if (command.subcommand === "search") {
      const results = store.search({
        query: command.query,
        limit: command.limit,
        ...(command.scope ? { scope: command.scope } : {}),
        ...(command.type ? { type: command.type } : {}),
        visibility: buildMemoryVisibilityContext({
          cwd: options.cwd ?? process.cwd(),
          ...(command.sessionId ? { sessionId: command.sessionId } : {}),
        }),
      });
      stdout.write(formatMemorySearchOutput(results));
      return;
    }

    if (command.subcommand === "explain") {
      const results = store.search({
        query: command.query,
        limit: command.limit,
        ...(command.scope ? { scope: command.scope } : {}),
        ...(command.type ? { type: command.type } : {}),
        visibility: buildMemoryVisibilityContext({
          cwd: options.cwd ?? process.cwd(),
          ...(command.sessionId ? { sessionId: command.sessionId } : {}),
        }),
      });
      stdout.write(formatMemorySearchOutput(results));
      return;
    }

    if (command.subcommand === "delete") {
      const deleted = governance.delete(command.id);
      if (!deleted) {
        throw new Error(`Memory not found: ${command.id}`);
      }
      stdout.write(`Deleted\t${deleted.id}\t${deleted.scope}\t${deleted.type}\n`);
      return;
    }

    if (command.subcommand === "archive") {
      const updated = governance.archive(command.id);
      if (!updated) {
        throw new Error(`Memory not found: ${command.id}`);
      }
      stdout.write(`Archived\t${updated.id}\t${updated.scope}\t${updated.type}\t${updated.status}\n`);
      return;
    }

    if (command.subcommand === "refresh") {
      const updated = governance.refresh(command.id);
      if (!updated) {
        throw new Error(`Memory not found: ${command.id}`);
      }
      stdout.write(`Refreshed\t${updated.id}\t${updated.scope}\t${updated.type}\t${updated.status}\n`);
      return;
    }

    if (command.subcommand === "promote") {
      const updated = governance.promote(command.id, command.scope);
      if (!updated) {
        throw new Error(`Memory not found: ${command.id}`);
      }
      stdout.write(`Promoted\t${updated.id}\t${updated.scope}\t${updated.type}\t${updated.status}\n`);
      return;
    }

    if (command.subcommand === "merge") {
      const merged = governance.merge(command.primaryId, command.duplicateIds);
      if (!merged) {
        throw new Error(`Memory not found: ${command.primaryId}`);
      }
      stdout.write(`Merged\t${merged.id}\t${merged.scope}\t${merged.type}\t${merged.status}\n`);
      return;
    }

    if (command.subcommand === "extract") {
      const loaded = sessionStore?.loadSession(command.sessionId);
      if (!loaded) {
        throw new Error(`Session not found: ${command.sessionId}`);
      }
      const candidates = governance.extract(loaded, { write: command.write });
      if (candidates.length === 0) {
        stdout.write("No memory candidates found.\n");
        return;
      }
      for (const candidate of candidates) {
        const review = command.write ? governance.reviewCandidate(candidate) : undefined;
        stdout.write([
          candidate.id,
          candidate.type,
          candidate.suggestedScope,
          `confidence=${candidate.confidence}`,
          `risk=${candidate.risk}`,
          `reason=${candidate.reason}`,
          `text=${boundMemoryText(candidate.text, 160)}`,
          ...(review?.blocked ? [`blocked=${review.reason}`] : []),
        ].join("\t"));
        stdout.write("\n");
      }
      return;
    }

    throw new Error("Usage: kai memory add|list|search|explain|delete|archive|refresh|merge|promote|extract");
  } finally {
    sessionStore?.close();
    store?.close();
  }
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
      ...(command.permissionProfile ? { permissionProfile: command.permissionProfile } : {}),
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
  let mcpRuntime: CliMcpRuntime | undefined;
  try {
    const loaded = command.sessionId ? requireLoadedSession(store!, command.sessionId) : undefined;
    const loadedConfig = await loadModelConfig({ configPath: resolveConfigPath(options) });
    const model = loadedConfig.status === "ok" ? loadedConfig.profile.model : "debug-model";
    const profileName = resolveAgentProfileName({ sessionMetadata: loaded?.session.metadata });
    const humanInteractionManager = createCliHumanInteractionManager(options);
    mcpRuntime = await createCliMcpRuntime(options, humanInteractionManager, options.stderr ?? process.stderr);
    const registry = createProfileToolRegistry({
      profileName,
      humanInteractionManager,
      externalTools: mcpRuntime?.externalTools,
    });
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
    await closeCliMcpRuntime(mcpRuntime, options.stderr ?? process.stderr);
    store?.close();
  }
}

async function handleContext(argv: string[], options: CliOptions): Promise<void> {
  const command = parseContextCommand(argv);
  const stdout = options.stdout ?? process.stdout;

  if (command.subcommand === "trace") {
    const store = await openCliSessionStore(options);
    try {
      const loaded = requireLoadedSession(store, command.sessionId);
      const model = await resolveContextQualityModel(options);
      const artifacts = await buildContextQualityArtifacts({
        loadedSession: loaded,
        cwd: options.cwd ?? loaded.session.cwd ?? process.cwd(),
        model,
        profileName: resolveAgentProfileName({ sessionMetadata: loaded.session.metadata }),
      });
      stdout.write(renderContextTrace(artifacts.trace));
      return;
    } finally {
      store.close();
    }
  }

  if (command.subcommand === "replay") {
    const store = await openCliSessionStore(options);
    try {
      const loaded = requireLoadedSession(store, command.sessionId);
      const model = await resolveContextQualityModel(options);
      const replay = await replayLoadedSessionContext({
        id: loaded.session.id,
        cwd: options.cwd ?? loaded.session.cwd ?? process.cwd(),
        model,
        loadedSession: loaded,
        profileName: resolveAgentProfileName({ sessionMetadata: loaded.session.metadata }),
      });
      stdout.write(`${JSON.stringify(replay, null, 2)}\n`);
      return;
    } finally {
      store.close();
    }
  }

  if (command.subcommand === "eval") {
    const fixture = await readContextQualityFixture(options, command.fixturePath);
    const snapshot = snapshotFromTrace({
      items: fixture.trace.items,
      modelInputDigest: fixture.trace.modelInputDigest,
      ...(fixture.trace.budget ? { budget: fixture.trace.budget } : {}),
    });
    const evaluation = evaluateContextQualityFixture({ fixture, snapshot });
    stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`);
    return;
  }

  if (command.subcommand === "tune") {
    const fixture = await readContextQualityFixture(options, command.fixturePath);
    const snapshot = snapshotFromTrace({
      items: fixture.trace.items,
      modelInputDigest: fixture.trace.modelInputDigest,
      ...(fixture.trace.budget ? { budget: fixture.trace.budget } : {}),
    });
    const evaluation = evaluateContextQualityFixture({ fixture, snapshot });
    stdout.write(`${formatContextTuningReport({
      rules: defaultContextTuningRules(),
      metrics: evaluation.metrics,
    })}\n`);
    return;
  }

  if (command.subcommand === "diff") {
    const store = await openCliSessionStore(options);
    try {
      const loadedA = requireLoadedSession(store, command.sessionA);
      const loadedB = requireLoadedSession(store, command.sessionB);
      const model = await resolveContextQualityModel(options);
      const [artifactsA, artifactsB] = await Promise.all([
        buildContextQualityArtifacts({
          loadedSession: loadedA,
          cwd: options.cwd ?? loadedA.session.cwd ?? process.cwd(),
          model,
          profileName: resolveAgentProfileName({ sessionMetadata: loadedA.session.metadata }),
        }),
        buildContextQualityArtifacts({
          loadedSession: loadedB,
          cwd: options.cwd ?? loadedB.session.cwd ?? process.cwd(),
          model,
          profileName: resolveAgentProfileName({ sessionMetadata: loadedB.session.metadata }),
        }),
      ]);
      stdout.write(renderContextDebugDiff(diffContextDebugSnapshots(artifactsA.snapshot, artifactsB.snapshot)));
      return;
    } finally {
      store.close();
    }
  }

  throw new Error("Usage: kai context trace --session <id> | replay --session <id> | eval <fixture-path> | tune <fixture-path> | diff --session-a <id> --session-b <id>");
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
    const homeDir = resolveHomeDir(options);
    await runChatLoop({
      store,
      sessionId,
      cwd: options.cwd ?? process.cwd(),
      ...(homeDir ? { homeDir } : {}),
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
      const homeDir = resolveHomeDir(options);
      await runChatLoop({
        store,
        cwd: options.cwd ?? process.cwd(),
        ...(homeDir ? { homeDir } : {}),
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
    permissionProfile?: PermissionProfileName;
  } = {},
): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const renderer = new PlainRenderer({ stdout, stderr });
  const humanInteractionManager = createCliHumanInteractionManager(options);
  const interrupt = createInterruptBinding();
  let mcpRuntime: CliMcpRuntime | undefined;
  let memoryStore: SqliteMemoryStore | undefined;
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
  const homeDir = resolveHomeDir(options);
  const parentSessionId = runOptions.sessionContext?.session.id ?? randomUUID();
  const sessionRecorder = runOptions.sessionContext?.store.createRecorder(parentSessionId);
  const debugLogger = createDebugJsonlLogger({
    cwd: options.cwd ?? process.cwd(),
    env: options.env,
    stderr,
  });

  try {
    memoryStore = await openCliMemoryStore(options);
    const subAgentMailbox = createSubAgentToolMailbox();
    const middleware = [
      createSkillsMiddleware({
        ...(homeDir ? { homeDir } : {}),
      }),
      createMemoryMiddleware({
        store: memoryStore,
      }),
      createPermissionMiddleware({
        cwd: options.cwd ?? process.cwd(),
        homeDir,
        sessionId: parentSessionId,
        agentProfile: activeProfile,
        permissionProfile: commandPermissionProfile(runOptions, activeProfile),
        manager: humanInteractionManager,
        sessionRecorder,
      }),
      {
        name: "subagent",
        contextItems() {
          return buildSubAgentContextItems(subAgentMailbox);
        },
      },
    ];
    mcpRuntime = await createCliMcpRuntime(options, humanInteractionManager, stderr, interrupt.signal);
    const registryForProfile = (profileName: AgentProfileName) => createProfileToolRegistry({
      profileName,
      humanInteractionManager,
      planRuntime,
      externalTools: mcpRuntime?.externalTools,
      subAgentTool: profileName === "build"
        ? createSubAgentTool({
            provider,
            model,
            cwd: options.cwd ?? process.cwd(),
            sessionId: parentSessionId,
            mailbox: subAgentMailbox,
          })
        : undefined,
    });
    await debugLogger?.log({
      kind: "turn_start",
      task,
      model,
      sessionId: parentSessionId,
      cwd: options.cwd ?? process.cwd(),
    });
    try {
      await runReactLoop({
        task,
        model,
        provider,
        cwd: options.cwd ?? process.cwd(),
        sessionId: parentSessionId,
        initialMessages: runOptions.initialMessages,
        loadedSession: runOptions.sessionContext?.loaded,
        profileName: activeProfile,
        getToolRegistryForProfile: registryForProfile,
        onProfileChange(profileName) {
          activeProfile = profileName;
        },
        promptSubmission: runOptions.promptSubmission,
        sessionRecorder,
        signal: interrupt.signal,
        toolRegistry: registryForProfile(activeProfile),
        middleware,
        onEvent(event) {
          return debugLogger?.log({ kind: "provider_event", event });
        },
        onUiEvent(event) {
          void debugLogger?.log({ kind: "ui_event", event });
          renderer.render(event);
        },
        onToolResult(toolUse, rawResult, modelContent) {
          return debugLogger?.log({
            kind: "tool_result",
            toolUse,
            ok: rawResult.ok,
            output: rawResult.output,
            metadata: rawResult.metadata,
            modelContent,
          });
        },
      });
      const extractionSource = runOptions.sessionContext?.loaded
        ?? (runOptions.sessionContext?.store ? runOptions.sessionContext.store.loadSession(runOptions.sessionContext.session.id) : undefined);
      if (memoryStore && extractionSource) {
        const extractionGovernance = new MemoryGovernance(memoryStore);
        const candidates = extractionGovernance.extract(extractionSource);
        if ((options.env ?? process.env).KAI_MEMORY_EXTRACTION_WRITE === "1") {
          for (const candidate of candidates) {
            extractionGovernance.reviewCandidate(candidate);
          }
        }
      }
      await debugLogger?.log({ kind: "turn_end", status: "success" });
    } catch (error) {
      await debugLogger?.log({
        kind: "turn_end",
        status: "error",
        error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
      });
      throw error;
    }
    stdout.write("\n");
  } finally {
    await closeCliMcpRuntime(mcpRuntime, stderr);
    memoryStore?.close();
    interrupt.cleanup();
  }
}

function parseRunCommand(argv: string[]): RunCommandOptions {
  let providerName: string | undefined;
  let scriptPath: string | undefined;
  let session: string | undefined;
  let permissionProfile: PermissionProfileName | undefined;
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
    if (arg === "--permission") {
      const value = readFlagValue(argv, index, "--permission");
      permissionProfile = parsePermissionProfile(value);
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
    ...(permissionProfile ? { permissionProfile } : {}),
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

function parsePermissionProfile(value: string): PermissionProfileName {
  if (value === "readOnly" || value === "workspaceWrite" || value === "dangerFullAccess") {
    return value;
  }
  throw new Error(`Unsupported permission profile '${value}'`);
}

function commandPermissionProfile(
  runOptions: { sessionContext?: SessionRunContext; permissionProfile?: PermissionProfileName },
  activeProfile: AgentProfileName,
): PermissionProfileName {
  return runOptions.permissionProfile
    ?? (runOptions.sessionContext?.session.metadata?.permissionProfile as PermissionProfileName | undefined)
    ?? (activeProfile === "plan" ? "readOnly" : "workspaceWrite");
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

function parseContextCommand(argv: string[]): ContextCommandOptions {
  const [subcommand = ""] = argv;
  if (subcommand === "trace" || subcommand === "replay") {
    let sessionId = "";
    for (let index = 1; index < argv.length; index += 1) {
      if (argv[index] === "--session") {
        sessionId = readFlagValue(argv, index, "--session");
        index += 1;
      }
    }
    if (!sessionId) {
      throw new Error(`Usage: kai context ${subcommand} --session <session-id>`);
    }
    return { subcommand, sessionId } as ContextTraceCommandOptions | ContextReplayCommandOptions;
  }

  if (subcommand === "eval" || subcommand === "tune") {
    const [fixturePath = ""] = argv.slice(1);
    if (!fixturePath) {
      throw new Error(`Usage: kai context ${subcommand} <fixture-path>`);
    }
    return { subcommand, fixturePath } as ContextEvalCommandOptions | ContextTuneCommandOptions;
  }

  if (subcommand === "diff") {
    let sessionA = "";
    let sessionB = "";
    for (let index = 1; index < argv.length; index += 1) {
      if (argv[index] === "--session-a") {
        sessionA = readFlagValue(argv, index, "--session-a");
        index += 1;
        continue;
      }
      if (argv[index] === "--session-b") {
        sessionB = readFlagValue(argv, index, "--session-b");
        index += 1;
      }
    }
    if (!sessionA || !sessionB) {
      throw new Error("Usage: kai context diff --session-a <id> --session-b <id>");
    }
    return { subcommand, sessionA, sessionB };
  }

  throw new Error("Usage: kai context trace|replay|eval|tune|diff");
}

function parseMemoryCommand(argv: string[]): MemoryCommand {
  const [subcommand = ""] = argv;
  let scope: MemoryScope | undefined;
  let type: MemoryType | undefined;
  let sessionId: string | undefined;
  let limit: number | undefined;
  let write = false;
  const positional: string[] = [];

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scope") {
      scope = parseMemoryScope(readFlagValue(argv, index, "--scope"));
      index += 1;
      continue;
    }
    if (arg === "--type") {
      type = parseMemoryType(readFlagValue(argv, index, "--type"));
      index += 1;
      continue;
    }
    if (arg === "--session-id") {
      sessionId = readFlagValue(argv, index, "--session-id");
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      limit = parseNumberFlag(readFlagValue(argv, index, "--limit"), "--limit");
      index += 1;
      continue;
    }
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg) {
      positional.push(arg);
    }
  }

  if (subcommand === "add") {
    const text = positional.join(" ").trim();
    if (!scope) {
      throw new Error("--scope is required");
    }
    if (!type) {
      throw new Error("--type is required");
    }
    if (!text) {
      throw new Error("Memory text is required");
    }
    if (scope === "session" && !sessionId) {
      throw new Error("--session-id is required for session scope");
    }
    return {
      subcommand,
      scope,
      type,
      text,
      ...(sessionId ? { sessionId } : {}),
    };
  }

  if (subcommand === "list") {
    return {
      subcommand,
      ...(scope ? { scope } : {}),
      ...(type ? { type } : {}),
      ...(sessionId ? { sessionId } : {}),
    };
  }

  if (subcommand === "search") {
    const query = positional.join(" ").trim();
    if (!query) {
      throw new Error("Usage: kai memory search <query>");
    }
    return {
      subcommand,
      query,
      ...(scope ? { scope } : {}),
      ...(type ? { type } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(limit !== undefined ? { limit } : {}),
    };
  }

  if (subcommand === "delete") {
    const [id = ""] = positional;
    if (!id) {
      throw new Error("Usage: kai memory delete <id>");
    }
    return {
      subcommand,
      id,
    };
  }

  if (subcommand === "archive" || subcommand === "refresh") {
    const [id = ""] = positional;
    if (!id) {
      throw new Error(`Usage: kai memory ${subcommand} <id>`);
    }
    return {
      subcommand,
      id,
    } as MemoryArchiveCommand | MemoryRefreshCommand;
  }

  if (subcommand === "promote") {
    const [id = ""] = positional;
    if (!id) {
      throw new Error("Usage: kai memory promote <id> --scope <scope>");
    }
    if (!scope) {
      throw new Error("--scope is required for promote");
    }
    return {
      subcommand,
      id,
      scope,
    };
  }

  if (subcommand === "merge") {
    const [primaryId = "", ...duplicateIds] = positional;
    if (!primaryId || duplicateIds.length === 0) {
      throw new Error("Usage: kai memory merge <primary-id> <duplicate-id> [duplicate-id...]");
    }
    return {
      subcommand,
      primaryId,
      duplicateIds,
    };
  }

  if (subcommand === "extract") {
    if (!sessionId) {
      throw new Error("--session-id is required for extract");
    }
    return {
      subcommand,
      sessionId,
      write,
    };
  }

  if (subcommand === "explain") {
    const query = positional.join(" ").trim();
    if (!query) {
      throw new Error("Usage: kai memory explain <query>");
    }
    return {
      subcommand,
      query,
      ...(scope ? { scope } : {}),
      ...(type ? { type } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(limit !== undefined ? { limit } : {}),
    };
  }

  throw new Error("Usage: kai memory add|list|search|explain|delete|archive|refresh|merge|promote|extract");
}

async function resolveContextQualityModel(options: CliOptions): Promise<string> {
  const loaded = await loadModelConfig({ configPath: resolveConfigPath(options) });
  if (loaded.status === "ok") {
    return loaded.profile.model;
  }
  return "debug-model";
}

function parseMemoryScope(value: string): MemoryScope {
  if (value === "user" || value === "project" || value === "projectLocal" || value === "session") {
    return value;
  }
  throw new Error(`Unsupported memory scope '${value}'`);
}

function parseMemoryType(value: string): MemoryType {
  if (
    value === "preference" ||
    value === "fact" ||
    value === "decision" ||
    value === "project" ||
    value === "reference"
  ) {
    return value;
  }
  throw new Error(`Unsupported memory type '${value}'`);
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
  if (options.configPath) {
    return options.configPath;
  }
  const env = options.env ?? process.env;
  if (env.KAI_CONFIG_PATH) {
    return env.KAI_CONFIG_PATH;
  }
  const homeDir = env.KAI_HOME ?? env.HOME;
  if (homeDir) {
    return getDefaultModelConfigPath({ homeDir });
  }
  return process.env.KAI_CONFIG_PATH;
}

function resolveHomeDir(options: CliOptions): string | undefined {
  return options.env?.HOME ?? process.env.HOME;
}

function resolveSettingsPathOptions(options: CliOptions): { cwd: string; homeDir?: string } {
  const env = options.env ?? process.env;
  return {
    cwd: options.cwd ?? process.cwd(),
    ...(env.KAI_HOME ? { homeDir: env.KAI_HOME } : env.HOME ? { homeDir: env.HOME } : {}),
  };
}

async function readContextQualityFixture(options: CliOptions, fixturePath: string): Promise<import("../coding/context/quality/index.js").ContextEvalFixture> {
  const fullPath = path.isAbsolute(fixturePath)
    ? fixturePath
    : path.join(options.cwd ?? process.cwd(), fixturePath);
  const raw = JSON.parse(await readFile(fullPath, "utf8"));
  return normalizeContextEvalFixture(raw);
}

async function createCliMcpRuntime(
  options: CliOptions,
  humanInteractionManager: HumanInteractionManager | undefined,
  stderr: Writable,
  signal?: AbortSignal,
): Promise<CliMcpRuntime | undefined> {
  const loaded = await loadMcpConfig(resolveSettingsPathOptions(options));
  for (const error of loaded.errors) {
    stderr.write(`[mcp] ${error.serverName}\tERROR\t${error.message}\n`);
  }
  if (loaded.servers.length === 0) {
    return undefined;
  }

  const manager = new McpClientManager({
    servers: loaded.servers,
    cwd: options.cwd ?? process.cwd(),
  });
  const tools: McpToolAdapterResult[] = [];

  for (const server of loaded.servers) {
    try {
      tools.push(...adaptMcpTools({
        server,
        tools: await manager.listTools(server.name, signal),
        clientManager: manager,
        humanInteractionManager,
      }));
    } catch (error) {
      stderr.write(`[mcp] ${server.name}\tERROR\t${redactMcpText(mcpErrorMessage(error), loaded.servers)}\n`);
    }
  }

  return {
    manager,
    servers: loaded.servers,
    tools,
    externalTools: tools.map((tool) => tool.tool),
  };
}

async function closeCliMcpRuntime(runtime: CliMcpRuntime | undefined, stderr: Writable): Promise<void> {
  if (!runtime) {
    return;
  }
  try {
    await runtime.manager.closeAll();
  } catch (error) {
    stderr.write(`[mcp] close\tERROR\t${redactMcpText(mcpErrorMessage(error), runtime.servers)}\n`);
  }
}

function formatMemoryAddOutput(record: MemoryRecord): string {
  const fields = [
    "Memory created",
    record.id,
    record.scope,
    record.type,
    record.status,
    `createdAt=${record.createdAt}`,
    `updatedAt=${record.updatedAt}`,
    `projectPath=${record.projectPath ?? ""}`,
    `sessionId=${record.sourceSessionId ?? ""}`,
    `text=${boundMemoryText(record.text, 160)}`,
  ];
  return `${fields.join("\t")}\n`;
}

function formatMemoryRecordsOutput(records: MemoryRecord[]): string {
  if (records.length === 0) {
    return "No memories found.\n";
  }
  const rows = records.map((record) => [
    record.id,
    record.scope,
    record.type,
    record.status,
    record.createdAt,
    record.updatedAt,
    record.projectPath ?? "",
    record.sourceSessionId ?? "",
    boundMemoryText(record.text, 160),
  ].join("\t"));
  return `${[
    "id\tscope\ttype\tstatus\tcreatedAt\tupdatedAt\tprojectPath\tsessionId\ttext",
    ...rows,
  ].join("\n")}\n`;
}

function formatMemorySearchOutput(results: MemorySearchResult[]): string {
  if (results.length === 0) {
    return "No memories found.\n";
  }
  const rows = results.map((result) => [
    result.record.id,
    result.record.scope,
    result.record.type,
    result.record.status,
    result.record.createdAt,
    result.record.updatedAt,
    result.record.projectPath ?? "",
    result.record.sourceSessionId ?? "",
    String(result.score),
    boundMemoryText(result.reason, 120),
    boundMemoryText(result.record.text, 120),
  ].join("\t"));
  return `${[
    "id\tscope\ttype\tstatus\tcreatedAt\tupdatedAt\tprojectPath\tsessionId\tscore\treason\ttext",
    ...rows,
  ].join("\n")}\n`;
}

function boundMemoryText(value: string, maxChars: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

async function openCliSessionStore(options: CliOptions): Promise<SqliteSessionStore> {
  return openSqliteSessionStore(getDefaultSessionDbPath({
    env: options.env,
    sessionDbPath: options.sessionDbPath,
  }));
}

async function openCliMemoryStore(options: CliOptions): Promise<SqliteMemoryStore> {
  return openSqliteMemoryStore(getDefaultMemoryDbPath({
    env: options.env,
    memoryDbPath: options.memoryDbPath,
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
