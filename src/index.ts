export { main, runCli } from "./cli/main.js";
export type { CliOptions } from "./cli/main.js";
export { runOnce } from "./agent/loop.js";
export type { Message, Role, RunResult } from "./agent/messages.js";
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
export { OpenAIProvider, parseOpenAIChunk, parseOpenAIStream } from "./provider/openai.js";
export { ProviderError } from "./provider/types.js";
export type {
  ProviderAdapter,
  ProviderErrorOptions,
  ProviderEvent,
  ProviderInput,
} from "./provider/types.js";
export { formatError, renderError, renderProviderEvent } from "./ui/render.js";
export { SECRET_MASK, maskSecret, redactSecret } from "./ui/secrets.js";
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
export { runInkSetup, runInkTaskEntry } from "./ui/tui.js";
export type {
  JsonObject,
  JsonValue,
  ToolContext,
  ToolDef,
  ToolResult,
  ToolRuntimeEvent,
} from "./tools/types.js";
