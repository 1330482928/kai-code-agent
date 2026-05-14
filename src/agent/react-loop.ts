import { randomUUID } from "node:crypto";

import type { Message, RunResult } from "../foundation/message.js";
import {
  type ExecutableToolUse,
  type ToolResult,
} from "../foundation/tool.js";
import type { UiEvent } from "../foundation/ui-event.js";
import type { ProviderAdapter, ProviderEvent, ProviderInput } from "../provider/types.js";
import type { ToolRegistry } from "../coding/tools/registry.js";
import { runTool } from "../coding/tools/runner.js";
import {
  buildContextItemsForRun,
  ContextManager,
  type ContextAssemblyOptions,
  type ContextBudget,
  ModelInputBuilder,
  type ContextItem,
  type ModelInputBuildResult,
} from "../coding/context/index.js";
import { MiddlewarePipeline, isAbortError, throwIfAborted, type AgentMiddleware } from "./middleware.js";
import { summarizeToolUse } from "../foundation/tool-summary.js";
import { ToolAccumulator, type ToolAssemblyResult } from "./tool-accumulator.js";
import { ToolState } from "./tool-state.js";
import { formatToolResultForModel } from "./tool-result-formatter.js";
import type { LoadedSession, PromptSubmission, SessionRecorder } from "../session/types.js";
import type { AgentProfileName } from "./profiles.js";
import { isRetryableProviderError, runWithRetry, type RetryPolicy } from "./retry.js";
import {
  parseFailureToolResult,
  providerFailureToolResult,
  summarizeRecoveredError,
  toolUseFromInvalidAssembly,
} from "./recovery.js";

const MAX_REACT_ITERATIONS = 20;

export interface RunReactLoopOptions {
  task: string;
  model: string;
  provider: ProviderAdapter;
  toolRegistry?: ToolRegistry;
  cwd?: string;
  sessionId?: string;
  initialMessages?: Message[];
  promptSubmission?: PromptSubmission;
  sessionRecorder?: SessionRecorder;
  loadedSession?: LoadedSession;
  profileName?: AgentProfileName;
  getToolRegistryForProfile?: (profileName: AgentProfileName) => ToolRegistry | undefined;
  approvedPlanContext?: string;
  contextItems?: ContextItem[];
  contextOptions?: ReactLoopContextOptions;
  modelInputBuilder?: ModelInputBuilder;
  onContextBuild?: (result: ModelInputBuildResult) => void | Promise<void>;
  onProfileChange?: (profileName: AgentProfileName) => void | Promise<void>;
  signal?: AbortSignal;
  middleware?: AgentMiddleware[];
  onEvent?: (event: ProviderEvent) => void | Promise<void>;
  onUiEvent?: (event: UiEvent) => void | Promise<void>;
  onToolResult?: (toolUse: ExecutableToolUse, rawResult: ToolResult, modelContent: string) => void | Promise<void>;
  retryPolicy?: RetryPolicy;
  retrySleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface ReactLoopContextOptions extends ContextAssemblyOptions {
  budget?: Partial<ContextBudget>;
  allowCompaction?: boolean;
  tailTokenBudget?: number;
}

export async function runReactLoop(options: RunReactLoopOptions): Promise<RunResult> {
  const controller = options.signal ? null : new AbortController();
  const signal = options.signal ?? controller?.signal;
  if (!signal) {
    throw new Error("failed to create abort signal");
  }

  const userMessage: Message = {
    role: "user",
    content: options.task,
  };
  const messages: Message[] = [
    ...(options.initialMessages ?? []),
    userMessage,
  ];
  let usage: RunResult["usage"];
  let currentProfile: AgentProfileName = options.profileName ?? "build";
  const sessionId = options.sessionId ?? randomUUID();
  const cwd = options.cwd ?? process.cwd();
  const pipeline = new MiddlewarePipeline(options.middleware);
  const toolState = new ToolState();
  const baseContext = {
    sessionId,
    cwd,
    signal,
  };

  try {
    await pipeline.beforeAgentRun({
      ...baseContext,
      task: options.task,
      model: options.model,
    });
    await options.sessionRecorder?.recordUserMessage({
      task: options.task,
      submission: options.promptSubmission,
      profile: currentProfile,
      requestedProfile: typeof options.promptSubmission?.metadata?.requestedProfile === "string"
        ? options.promptSubmission.metadata.requestedProfile
        : undefined,
    });

    for (let iteration = 0; iteration < MAX_REACT_ITERATIONS; iteration += 1) {
      throwIfAborted(signal);
      let assistantText = "";
      const assistantThinking: string[] = [];
      const toolCalls: ExecutableToolUse[] = [];
      const parseFailures = new Map<string, ToolResult>();
      const accumulator = new ToolAccumulator();
      let sawDone = false;
      let currentAttemptHadIrreversibleOutput = false;
      let providerFailure: unknown;

  const contextBuild = await buildProviderInputForIteration(options, {
    cwd,
    messages,
    model: options.model,
    profileName: currentProfile,
    tools: registryForProfile(options, currentProfile)?.providerSchemas(),
    currentUserOrdinal: options.initialMessages?.length ?? 0,
    provider: options.provider,
    signal,
  });
      await options.onContextBuild?.(contextBuild);

      const providerInput: ProviderInput = await pipeline.beforeModel({
        ...baseContext,
        messages,
        input: contextBuild.providerInput,
        contextItems: contextBuild.items,
        contextBuild,
      });

      try {
        await runWithRetry(async () => {
          currentAttemptHadIrreversibleOutput = false;
          for await (const event of options.provider.stream(providerInput, signal)) {
            throwIfAborted(signal);
            if (isIrreversibleProviderEvent(event)) {
              currentAttemptHadIrreversibleOutput = true;
            }
            if (event.type === "text_delta") {
              assistantText += event.text;
              await emitUi(options, { type: "text_delta", delta: event.text });
            } else if (event.type === "thinking_delta") {
              assistantThinking.push(event.text);
              await emitUi(options, { type: "thinking_delta", delta: event.text, hidden: true });
            } else if (event.type === "usage") {
              usage = {
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
              };
            } else if (event.type === "tool_call") {
              toolCalls.push(event.toolCall);
            } else if (event.type === "tool_call_delta") {
              collectToolAssembly(accumulator.append({
                id: event.id,
                name: event.name,
                argumentsDelta: event.argumentsDelta,
                final: event.final,
              }), toolCalls, parseFailures);
            }

            await options.onEvent?.(event);
            if (event.type === "done") {
              sawDone = true;
              for (const result of accumulator.finalizePending()) {
                collectToolAssembly(result, toolCalls, parseFailures);
              }
              break;
            }
          }
          if (!sawDone) {
            for (const result of accumulator.finalizePending()) {
              collectToolAssembly(result, toolCalls, parseFailures);
            }
          }
        }, {
          policy: options.retryPolicy,
          signal,
          sleep: options.retrySleep,
          shouldRetry(error) {
            return !currentAttemptHadIrreversibleOutput && isRetryableProviderError(error);
          },
        });
      } catch (error) {
        providerFailure = error;
        for (const result of accumulator.finalizePending()) {
          collectToolAssembly(result, toolCalls, parseFailures);
        }
      }

      if (providerFailure) {
        if (toolCalls.length === 0) {
          throw providerFailure;
        }
        for (const toolUse of toolCalls) {
          if (!parseFailures.has(toolUse.id)) {
            parseFailures.set(toolUse.id, providerFailureToolResult(toolUse, providerFailure));
          }
        }
      }

      await pipeline.afterModel({
        ...baseContext,
        messages,
        input: providerInput,
        output: {
          assistantText,
          toolCalls,
        },
      });
      await options.sessionRecorder?.recordAssistantMessage({
        text: assistantText,
        thinking: assistantThinking,
        toolCalls,
      });

      if (toolCalls.length === 0) {
        const assistantMessage: Message = {
          role: "assistant",
          content: assistantText,
        };
        messages.push(assistantMessage);
        const result = {
          messages,
          assistantMessage,
          usage,
        };
        await emitUi(options, { type: "turn_done" });
        await pipeline.afterAgentRun({
          ...baseContext,
          task: options.task,
          model: options.model,
          status: "success",
          result,
        });
        await options.sessionRecorder?.completeTurn({ status: "success", messages });
        return result;
      }

      messages.push({
        role: "assistant",
        content: assistantText,
        toolCalls,
      });

      for (const toolUse of toolCalls) {
        throwIfAborted(signal);
        const summary = summarizeToolUse(toolUse);
        toolState.start(toolUse, summary);
        await emitUi(options, { type: "tool_start", id: toolUse.id, name: toolUse.name, summary });

        let rawResult = parseFailures.get(toolUse.id);
        const toolStartedAt = new Date().toISOString();
        if (!rawResult) {
          const intercepted = await pipeline.beforeToolUse({
            ...baseContext,
            toolUse,
          });
          rawResult = intercepted ?? await runTool(
            registryForProfile(options, currentProfile) ?? emptyRegistry(),
            toolUse,
            {
              cwd,
              signal,
              sessionId,
              toolCallId: toolUse.id,
              emit(event) {
                if (event.type === "bash_progress") {
                  return emitUi(options, event);
                }
                return undefined;
              },
            },
          );
        }

        rawResult = await pipeline.afterToolUse({
          ...baseContext,
          toolUse,
          result: rawResult,
        });
        const modelContent = formatToolResultForModel(toolUse.name, rawResult);
        const toolEndedAt = new Date().toISOString();
        const resultSummary = summarizeToolResult(rawResult);
        const recovered = parseFailures.has(toolUse.id);
        toolState.finish(toolUse.id, rawResult.ok, resultSummary, {
          recovered,
          interrupted: rawResult.error?.kind === "interrupted",
        });
        await emitUi(options, { type: "tool_result", id: toolUse.id, ok: rawResult.ok, summary: resultSummary });
        await options.onToolResult?.(toolUse, rawResult, modelContent);
        await options.sessionRecorder?.recordToolResult({
          toolUse,
          rawResult,
          modelContent,
          cwd,
          startedAt: toolStartedAt,
          endedAt: toolEndedAt,
          profile: currentProfile,
        });
        const nextProfile = nextProfileFromToolResult(rawResult);
        messages.push({
          role: "tool",
          content: modelContent,
          toolCallId: toolUse.id,
          name: toolUse.name,
        });
        if (nextProfile && nextProfile !== currentProfile) {
          currentProfile = nextProfile;
          await options.onProfileChange?.(currentProfile);
        }
      }
    }

    throw new Error(`ReAct loop exceeded ${MAX_REACT_ITERATIONS} iterations`);
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      await emitUi(options, { type: "turn_aborted", reason: "aborted" });
      await pipeline.afterAgentRun({
        ...baseContext,
        task: options.task,
        model: options.model,
        status: "aborted",
        error,
      });
      await options.sessionRecorder?.completeTurn({ status: "aborted", error });
      throw error;
    }

    await pipeline.afterAgentRun({
      ...baseContext,
      task: options.task,
      model: options.model,
      status: "error",
      error,
    });
    await emitUi(options, { type: "turn_error", summary: summarizeRecoveredError(error) });
    await options.sessionRecorder?.completeTurn({ status: "error", error });
    throw error;
  }
}

function collectToolAssembly(
  result: ToolAssemblyResult,
  toolCalls: ExecutableToolUse[],
  parseFailures: Map<string, ToolResult>,
): void {
  if (result.type === "partial") {
    return;
  }

  if (result.type === "complete") {
    toolCalls.push(result.toolUse);
    return;
  }

  const toolUse = toolUseFromInvalidAssembly(result);
  toolCalls.push(toolUse);
  parseFailures.set(result.id, parseFailureToolResult(result));
}

function isIrreversibleProviderEvent(event: ProviderEvent): boolean {
  return event.type === "text_delta"
    || event.type === "thinking_delta"
    || event.type === "usage"
    || event.type === "tool_call"
    || event.type === "tool_call_delta";
}

async function emitUi(options: RunReactLoopOptions, event: UiEvent): Promise<void> {
  await options.onUiEvent?.(event);
}

function summarizeToolResult(result: ToolResult): string {
  if (result.error) {
    return result.error.message;
  }
  if (result.output.length <= 160) {
    return result.output;
  }
  return `${result.output.slice(0, 157)}...`;
}

function emptyRegistry(): Pick<ToolRegistry, "get"> {
  return {
    get() {
      return undefined;
    },
  };
}

function registryForProfile(options: RunReactLoopOptions, profileName: AgentProfileName): ToolRegistry | undefined {
  return options.getToolRegistryForProfile?.(profileName) ?? options.toolRegistry;
}

async function buildProviderInputForIteration(
  options: RunReactLoopOptions,
  input: {
    cwd: string;
    messages: Message[];
    model: string;
    profileName: AgentProfileName;
    tools?: ProviderInput["tools"];
    currentUserOrdinal: number;
    provider: ProviderAdapter;
    signal: AbortSignal;
  },
): Promise<ModelInputBuildResult> {
  const contextOptions = options.contextOptions ?? {};
  const items: ContextItem[] = await buildContextItemsForRun({
    cwd: input.cwd,
    messages: input.messages,
    loadedSession: options.loadedSession,
    profileName: input.profileName,
    currentUserOrdinal: input.currentUserOrdinal,
    contextOptions,
    approvedPlanContext: options.approvedPlanContext,
    extraItems: options.contextItems,
  });

  const manager = new ContextManager({
    builder: options.modelInputBuilder ?? new ModelInputBuilder({ budget: contextOptions.budget }),
    budget: contextOptions.budget,
    allowCompaction: contextOptions.allowCompaction,
    tailTokenBudget: contextOptions.tailTokenBudget,
  });
  return manager.build({
    model: input.model,
    items,
    tools: input.tools,
    provider: input.provider,
    signal: input.signal,
    loadedSession: options.loadedSession,
    sessionRecorder: options.sessionRecorder,
    profileName: input.profileName,
  });
}

function nextProfileFromToolResult(result: ToolResult): AgentProfileName | undefined {
  const plan = result.metadata?.plan;
  if (typeof plan === "object" && plan !== null && !Array.isArray(plan)) {
    const nextProfile = (plan as Record<string, unknown>).nextProfile;
    if (nextProfile === "build" || nextProfile === "plan") {
      return nextProfile;
    }
  }
  const nextProfile = result.metadata?.nextProfile;
  if (nextProfile === "build" || nextProfile === "plan") {
    return nextProfile;
  }
  return undefined;
}
