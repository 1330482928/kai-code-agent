export { main, runCli } from "./cli/main.js";
export type { CliOptions } from "./cli/main.js";
export { runOnce } from "./agent/loop.js";
export { runReactLoop } from "./agent/react-loop.js";
export type { RunReactLoopOptions } from "./agent/react-loop.js";
export {
  buildProfile,
  createProfileToolRegistry,
  filterToolsForProfile,
  getAgentProfile,
  hasWritableScope,
  InvalidAgentProfileError,
  isAgentProfileName,
  planProfile,
  profileToolNames,
  resolveAgentProfileName,
} from "./agent/profiles.js";
export type { AgentProfile, AgentProfileName, AgentWritableScope, ProfileToolRegistryOptions } from "./agent/profiles.js";
export { HumanInteractionManager } from "./agent/human-interaction-manager.js";
export type {
  ApprovalPromptInput,
  ApprovalRequest,
  HumanInteractionListener,
  HumanInteractionRequest,
  HumanInteractionResponse,
  PlanApprovalPromptInput,
  PlanApprovalRequest,
  QuestionRequest,
} from "./agent/human-interaction-manager.js";
export {
  MiddlewarePipeline,
  isAbortError,
  throwIfAborted,
} from "./agent/middleware.js";
export type {
  AgentMiddleware,
  AgentRunAfterContext,
  AgentRunContext,
  MiddlewareContextBase,
  ModelAfterContext,
  ModelContext,
  ToolUseAfterContext,
  ToolUseContext,
} from "./agent/middleware.js";
export { StreamingReasoningSplitter, splitReasoningParts } from "./agent/reasoning-splitter.js";
export type { ReasoningPart } from "./agent/reasoning-splitter.js";
export { ToolAccumulator } from "./agent/tool-accumulator.js";
export type { ToolAssemblyResult, ToolCallDeltaInput } from "./agent/tool-accumulator.js";
export { ToolState } from "./agent/tool-state.js";
export type { ToolStateEntry, ToolStatus } from "./agent/tool-state.js";
export { formatToolResultForModel } from "./agent/tool-result-formatter.js";
export type { Message, Role, RunResult } from "./agent/messages.js";
export { summarizeToolUse } from "./foundation/tool-summary.js";
export type { ToolUseSummary } from "./foundation/tool-summary.js";
export { uiEventFromToolRuntimeEvent } from "./foundation/ui-event.js";
export type { QuestionPromptInput, ToolLifecycleSnapshot, UiEvent } from "./foundation/ui-event.js";
export type {
  ExecutableToolUse,
  JsonObject,
  JsonValue,
  ProviderRawToolCall,
  ProviderToolSchema,
  ToolContext,
  ToolDef,
  ToolError,
  ToolErrorKind,
  ToolResult,
  ToolResultFormatPolicy,
  ToolRuntimeEvent,
} from "./foundation/tool.js";
export {
  createToolFailure,
  isJsonObject,
  parseExecutableToolUse,
} from "./foundation/tool.js";
export {
  ensureModelConfig,
  providerPresets,
  runFirstRunWizard,
} from "./config/first-run.js";
export type {
  EnsuredModelConfig,
  PromptIO,
  ProviderPreset,
} from "./config/first-run.js";
export {
  formatModelConfigForDisplay,
  getDefaultModelConfigPath,
  loadModelConfig,
  modelConfigSchema,
  modelProfileSchema,
  parseModelConfig,
  redactApiKey,
  saveModelConfig,
} from "./config/model-config.js";
export type {
  LoadModelConfigResult,
  ModelConfig,
  ModelConfigPathOptions,
  ModelProfile,
} from "./config/model-config.js";
export { FixtureProvider, fixtureProviderEventSchema } from "./provider/fixture.js";
export { createProvider } from "./provider/factory.js";
export {
  OpenAIProvider,
  parseOpenAIChunk,
  parseOpenAIStream,
  serializeMessages,
  serializeTools,
} from "./provider/openai.js";
export { ProviderError } from "./provider/types.js";
export type {
  ProviderAdapter,
  ProviderErrorOptions,
  ProviderEvent,
  ProviderInput,
} from "./provider/types.js";
export { createInterruptBinding } from "./cli/interrupt.js";
export { historyForRun, runChatLoop, writeChatSnapshot } from "./cli/chat.js";
export { formatError, renderError, renderProviderEvent } from "./ui/render.js";
export { RenderBatcher } from "./ui/render-batcher.js";
export type { RenderBatcherOptions } from "./ui/render-batcher.js";
export { PlainRenderer, renderPlainUiEvent } from "./ui/plain/renderer.js";
export type { PlainRendererStreams } from "./ui/plain/renderer.js";
export {
  applyTurnEvent,
  createTurnRendererState,
  TurnRenderer,
} from "./ui/ink/turn-renderer.js";
export type { TurnRendererProps, TurnRendererState } from "./ui/ink/turn-renderer.js";
export { SECRET_MASK, maskSecret, redactSecret } from "./ui/secrets.js";
export {
  createInputEditorState,
  editorDisplayText,
  reduceInputEditor,
} from "./ui/input-editor.js";
export type { InputEditorAction, InputEditorState } from "./ui/input-editor.js";
export {
  createDefaultCommandRegistry,
  parseCommand,
} from "./ui/command-registry.js";
export type {
  CommandEntry,
  CommandRegistry,
  CommandResult,
  LocalCommandAction,
} from "./ui/command-registry.js";
export {
  applyCommandInput,
  createCommandInputState,
  useCommandInput,
} from "./ui/use-command-input.js";
export type {
  CommandInputKey,
  CommandInputOutput,
  CommandInputState,
} from "./ui/use-command-input.js";
export {
  applyChatTurnEvent,
  ChatShell,
  createChatShellState,
  createChatTurnBatcher,
} from "./ui/chat-shell.js";
export type { ChatShellProps, ChatShellState } from "./ui/chat-shell.js";
export {
  buildModelConfigFromSetupDraft,
  createSetupState,
  nextSetupStep,
  selectPreset,
  selectedPreset,
  updateSetupDraft,
  validateSetupField,
} from "./ui/setup-state.js";
export type { SetupDraft, SetupState, SetupStep } from "./ui/setup-state.js";
export { runInkChatPrompt, runInkSetup, runInkTaskEntry } from "./ui/tui.js";
export { exportSessionJsonl, replaySessionPlain } from "./session/export.js";
export { getDefaultSessionDbPath } from "./session/path.js";
export { projectMessageText, projectTranscriptHistory } from "./session/projector.js";
export { rebuildProviderMessages } from "./session/rebuild.js";
export {
  openSqliteSessionStore,
  SessionTranscriptRecorder,
  SqliteSessionStore,
} from "./session/sqlite-store.js";
export type {
  AppendMessageInput,
  AppendPartInput,
  BashRunMetadata,
  LoadedSession,
  RecordCompactionSummaryInput,
  RecordCompactionSummaryResult,
  PromptSubmission,
  PromptSubmissionMetadata,
  RecordAssistantMessageInput,
  RecordToolResultInput,
  RecordUserMessageInput,
  RenderedHistoryItem,
  SessionMessageRole,
  SessionPartType,
  SessionRecord,
  SessionRecorder,
  SessionStore,
  SessionSummary,
  TranscriptMessage,
  TranscriptPart,
} from "./session/types.js";
export {
  bashInputSchema,
  bashTool,
  askUserQuestionInputSchema,
  askUserQuestionTool,
  createDefaultToolRegistry,
  createAskUserQuestionTool,
  editFileInputSchema,
  editFileTool,
  readFileInputSchema,
  readFileTool,
  resolveToolPath,
  runTool,
  ToolRegistry,
  writeFileInputSchema,
  writeFileTool,
} from "./coding/tools/index.js";
export { createApprovalMiddleware } from "./coding/middleware/approval.js";
export type { ApprovalMiddlewareOptions } from "./coding/middleware/approval.js";
export {
  createContextItem,
  createCurrentUserContextItem,
  createExcludedContextItem,
  DEFAULT_CONTEXT_BUDGET,
  approvedPlanContextItemsFromSession,
  buildCompactionPrompt,
  buildContextItemsForRun,
  buildPromptDebugSnapshot,
  boundText,
  COMPACTION_SUMMARY_SECTIONS,
  ContextManager,
  contextItemsFromLoadedSession,
  contextItemsFromMessages,
  contextCompactTriggerTokens,
  contextUsableInputTokens,
  createSummaryContextItem,
  estimateContextItemTokens,
  estimateContextItemsTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateTokens,
  estimateToolSchemaTokens,
  formatSummaryForModel,
  generateCompactionSummary,
  isContextItemIncluded,
  isSystemContextKind,
  messageFromContextItem,
  ModelInputBuilder,
  normalizeCompactionSummary,
  normalizeContextSource,
  orderContextItems,
  planContextBudget,
  providerMessagesFromContextItems,
  redactDebugText,
  renderPromptDebugText,
  resolveContextBudget,
  safePreview,
  selectRetainedTail,
  splitContextTurnSegments,
  stableContextItemId,
  toolCallIdsFromItem,
  truncateContextItem,
  truncateTextByEstimatedTokens,
  withEstimatedTokens,
} from "./coding/context/index.js";
export type {
  BuildCompactionPromptOptions,
  BuildContextItemsForRunInput,
  BuildManagedModelInputOptions,
  BuildModelInputOptions,
  BuildPromptDebugSnapshotOptions,
  ContextAssemblyOptions,
  ContextBudget,
  ContextBudgetDebug,
  ContextBudgetPlan,
  ContextCompactionDebug,
  ContextCutReason,
  ContextDebugItem,
  ContextItem,
  ContextItemKind,
  ContextItemSource,
  ContextManagerOptions,
  ContextTurnSegment,
  CreateContextItemInput,
  CreateExcludedContextItemInput,
  CreateSummaryContextItemOptions,
  CurrentUserContextInput,
  GenerateCompactionSummaryOptions,
  MessageContextProjectionOptions,
  ModelInputBuilderOptions,
  ModelInputBuildResult,
  PlanContextBudgetOptions,
  PromptDebugSnapshot,
  RetainedTailSelection,
} from "./coding/context/index.js";
export {
  buildBaseContextItems,
  buildProfileContextItems,
  buildRuntimeContextItems,
  findWorkspaceRoot,
  loadInstructionItems,
} from "./coding/prompt/index.js";
export type { InstructionLoadOptions, RuntimeContextOptions } from "./coding/prompt/index.js";
export { createPlanGuardMiddleware } from "./coding/plan/guard-middleware.js";
export type { PlanGuardOptions } from "./coding/plan/guard-middleware.js";
export { isReadonlyBashCommand } from "./coding/plan/readonly-bash.js";
export {
  approvedPlanContextFromSession,
  boundPlanContext,
  boundPlanPreview,
  findActivePlanPath,
  latestPlanPart,
  PlanStore,
} from "./coding/plan/store.js";
export type { PlanFile, PlanStoreOptions, PlanWriteResult } from "./coding/plan/store.js";
export {
  createPlanEnterTool,
  createPlanExitTool,
  createPlanTools,
  createPlanWriteTool,
  planEnterInputSchema,
  planExitInputSchema,
  planWriteInputSchema,
} from "./coding/plan/tools.js";
export type { PlanEnterInput, PlanExitInput, PlanToolRuntime, PlanWriteInput } from "./coding/plan/tools.js";
