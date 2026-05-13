import { getAgentProfile, type AgentProfileName } from "../../agent/profiles.js";
import { createContextItem, type ContextItem } from "../context/items.js";

export function buildProfileContextItems(profileName: AgentProfileName): ContextItem[] {
  const profile = getAgentProfile(profileName);
  return [
    createContextItem({
      id: `profile:${profile.name}`,
      kind: "profile",
      source: `profile.${profile.name}`,
      priority: 10,
      sticky: true,
      cacheStable: false,
      content: profile.name === "plan" ? planProfilePrompt() : buildProfilePrompt(),
      metadata: {
        profile: profile.name,
        promptId: profile.promptId,
        allowedTools: profile.allowedTools,
        writableScopes: profile.writableScopes,
      },
    }),
  ];
}

function buildProfilePrompt(): string {
  return [
    "Active profile: build.",
    "You may inspect the workspace and use the available coding tools to make approved changes.",
    "If planning is needed before edits, use the plan entry tool instead of making premature workspace changes.",
  ].join("\n");
}

function planProfilePrompt(): string {
  return [
    "Active profile: plan.",
    "Focus on understanding the task and writing an implementation plan.",
    "Do not mutate workspace files; use read/search tools, readonly bash, questions, and plan tools only.",
  ].join("\n");
}
