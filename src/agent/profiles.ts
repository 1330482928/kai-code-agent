import type { PromptSubmission } from "../session/types.js";
import type { JsonObject, ToolDef } from "../foundation/tool.js";
import { ToolRegistry, createDefaultToolRegistry, type DefaultToolRegistryOptions } from "../coding/tools/registry.js";
import { createPlanTools, type PlanToolRuntime } from "../coding/plan/tools.js";

export type AgentProfileName = "build" | "plan";
export type AgentWritableScope = "workspace" | "plan_file";

export interface AgentProfile {
  name: AgentProfileName;
  promptId: string;
  allowedTools: string[];
  writableScopes: AgentWritableScope[];
}

export class InvalidAgentProfileError extends Error {
  constructor(readonly requestedProfile: string) {
    super(`Unsupported agent profile '${requestedProfile}'`);
    this.name = "InvalidAgentProfileError";
  }
}

export const buildProfile: AgentProfile = {
  name: "build",
  promptId: "kai.build.v1",
  allowedTools: [
    "read_file",
    "write_file",
    "edit_file",
    "grep",
    "glob",
    "apply_patch",
    "bash",
    "ask_user_question",
    "plan_enter",
  ],
  writableScopes: ["workspace", "plan_file"],
};

export const planProfile: AgentProfile = {
  name: "plan",
  promptId: "kai.plan.v1",
  allowedTools: [
    "read_file",
    "grep",
    "glob",
    "bash",
    "ask_user_question",
    "plan_enter",
    "plan_write",
    "plan_exit",
  ],
  writableScopes: ["plan_file"],
};

const profiles: Record<AgentProfileName, AgentProfile> = {
  build: buildProfile,
  plan: planProfile,
};

export interface ResolveAgentProfileInput {
  promptSubmission?: PromptSubmission;
  sessionMetadata?: JsonObject;
  fallback?: AgentProfileName;
}

export function getAgentProfile(name: AgentProfileName): AgentProfile {
  return profiles[name];
}

export function isAgentProfileName(value: unknown): value is AgentProfileName {
  return value === "build" || value === "plan";
}

export function resolveAgentProfileName(input: ResolveAgentProfileInput = {}): AgentProfileName {
  const requested = input.promptSubmission?.metadata?.requestedProfile
    ?? input.sessionMetadata?.activeProfile
    ?? input.fallback
    ?? "build";
  if (requested === undefined || requested === null || requested === "") {
    return input.fallback ?? "build";
  }
  if (!isAgentProfileName(requested)) {
    throw new InvalidAgentProfileError(String(requested));
  }
  return requested;
}

export interface ProfileToolRegistryOptions extends DefaultToolRegistryOptions {
  profileName: AgentProfileName;
  planRuntime?: PlanToolRuntime;
  externalTools?: ToolDef[];
}

export function createProfileToolRegistry(options: ProfileToolRegistryOptions): ToolRegistry {
  const allTools = createDefaultToolRegistry({
    ...options,
    externalTools: [],
  }).list();
  if (options.planRuntime) {
    allTools.push(...createPlanTools(options.planRuntime));
  }
  const profile = getAgentProfile(options.profileName);
  const allowed = new Set(profile.allowedTools);
  const selected = allTools.filter((tool) => allowed.has(tool.name));
  if (options.profileName === "build") {
    selected.push(...(options.externalTools ?? []));
  }
  return new ToolRegistry(selected);
}

export function profileToolNames(profileName: AgentProfileName): string[] {
  return [...getAgentProfile(profileName).allowedTools];
}

export function hasWritableScope(profileName: AgentProfileName, scope: AgentWritableScope): boolean {
  return getAgentProfile(profileName).writableScopes.includes(scope);
}

export function filterToolsForProfile(profileName: AgentProfileName, tools: ToolDef[]): ToolDef[] {
  const allowed = new Set(getAgentProfile(profileName).allowedTools);
  return tools.filter((tool) => allowed.has(tool.name));
}
