import type { LoadedSession } from "../../../session/types.js";
import type { AgentProfileName } from "../../../agent/profiles.js";
import { buildContextItemsForRun, buildPromptDebugSnapshot, ContextManager, type ContextAssemblyOptions, type ContextDebugItem, type ContextItem, type PromptDebugSnapshot } from "../index.js";
import type { ContextEvalFixture, ContextQualityTraceItem } from "./types.js";
import { redactContextTraceValue } from "./redact.js";
import { currentUserOrdinalFromMessages, loadedSessionToMessages } from "./session.js";

export interface ReplayContextFixtureInput {
  id: string;
  cwd: string;
  model: string;
  task: string;
  messages?: import("../../../foundation/message.js").Message[];
  loadedSession?: LoadedSession;
  profileName?: AgentProfileName;
  currentUserOrdinal?: number;
  contextOptions?: ContextAssemblyOptions;
  extraItems?: ContextItem[];
}

export interface ReplayContextFixtureResult {
  fixtureId: string;
  snapshot: PromptDebugSnapshot;
  items: ContextDebugItem[];
}

export async function replayContextFixture(input: ReplayContextFixtureInput): Promise<ReplayContextFixtureResult> {
  const messages = input.messages ?? (input.loadedSession ? loadedSessionToMessages(input.loadedSession) : []);
  const builtItems = await buildContextItemsForRun({
    cwd: input.cwd,
    messages,
    loadedSession: input.loadedSession,
    profileName: input.profileName ?? "build",
    currentUserOrdinal: input.currentUserOrdinal ?? currentUserOrdinalFromMessages(messages),
    contextOptions: input.contextOptions,
    extraItems: input.extraItems,
  });
  const build = await new ContextManager({ readOnly: true }).build({
    model: input.model,
    items: builtItems,
  });
  const snapshot = buildPromptDebugSnapshot({ build, showItems: true });
  return {
    fixtureId: input.id,
    snapshot: redactContextTraceValue(snapshot),
    items: snapshot.items,
  };
}

export async function replayLoadedSessionContext(input: {
  id: string;
  cwd: string;
  model: string;
  loadedSession: LoadedSession;
  profileName?: AgentProfileName;
  contextOptions?: ContextAssemblyOptions;
  extraItems?: ContextItem[];
}): Promise<ReplayContextFixtureResult> {
  return replayContextFixture({
    id: input.id,
    cwd: input.cwd,
    model: input.model,
    task: "",
    loadedSession: input.loadedSession,
    profileName: input.profileName,
    contextOptions: input.contextOptions,
    extraItems: input.extraItems,
  });
}

export function normalizeContextEvalFixture(value: unknown): ContextEvalFixture {
  if (typeof value !== "object" || value === null) {
    throw new Error("Context eval fixture must be a JSON object");
  }
  const raw = value as Record<string, unknown>;
  const id = mustString(raw.id, "id");
  const trace = mustObject(raw.trace, "trace");
  const criticalFacts = mustStringArray(raw.criticalFacts, "criticalFacts");
  const forbiddenFacts = optionalStringArray(raw.forbiddenFacts, "forbiddenFacts");
  return {
    id,
    trace: trace as unknown as ContextEvalFixture["trace"],
    criticalFacts,
    ...(forbiddenFacts ? { forbiddenFacts } : {}),
    ...(Array.isArray(raw.expectedIncludedItemIds) ? { expectedIncludedItemIds: raw.expectedIncludedItemIds.filter((value): value is string => typeof value === "string") } : {}),
    ...(Array.isArray(raw.expectedExcludedKinds) ? { expectedExcludedKinds: raw.expectedExcludedKinds.filter((value): value is string => typeof value === "string") as ContextQualityTraceItem["kind"][] } : {}),
  };
}

function mustString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Context eval fixture field '${field}' must be a non-empty string`);
  }
  return value;
}

function mustObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Context eval fixture field '${field}' must be an object`);
  }
  return value as Record<string, unknown>;
}

function mustStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Context eval fixture field '${field}' must be a string array`);
  }
  return value as string[];
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return mustStringArray(value, field);
}
