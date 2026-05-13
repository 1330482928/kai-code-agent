import type { Message } from "../../foundation/message.js";
import type { LoadedSession } from "../../session/types.js";
import type { AgentProfileName } from "../../agent/profiles.js";
import {
  buildBaseContextItems,
  buildProfileContextItems,
  buildRuntimeContextItems,
  loadInstructionItems,
} from "../prompt/index.js";

import {
  approvedPlanContextItemsFromSession,
  contextItemsFromLoadedSession,
  contextItemsFromMessages,
} from "./history.js";
import { createContextItem, type ContextItem } from "./items.js";

export interface ContextAssemblyOptions {
  includeBase?: boolean;
  includeInstructions?: boolean;
  includeRuntime?: boolean;
  includeGit?: boolean;
  instructionRoot?: string;
  instructionMaxChars?: number;
  now?: () => Date;
}

export interface BuildContextItemsForRunInput {
  cwd: string;
  messages: Message[];
  loadedSession?: LoadedSession;
  profileName: AgentProfileName;
  currentUserOrdinal: number;
  contextOptions?: ContextAssemblyOptions;
  approvedPlanContext?: string;
  extraItems?: ContextItem[];
}

export async function buildContextItemsForRun(input: BuildContextItemsForRunInput): Promise<ContextItem[]> {
  const contextOptions = input.contextOptions ?? {};
  const items: ContextItem[] = [
    ...(contextOptions.includeBase === false ? [] : buildBaseContextItems()),
    ...buildProfileContextItems(input.profileName),
    ...(input.loadedSession ? contextItemsFromLoadedSession(input.loadedSession) : []),
    ...contextItemsFromMessages(input.messages, {
      source: "run.messages",
      basePriority: 1000,
      currentUserOrdinal: input.currentUserOrdinal,
    }),
    ...approvedPlanContextItemsFromSession(input.loadedSession, input.profileName),
    ...approvedPlanContextFallbackItems(input.approvedPlanContext, input.loadedSession, input.profileName),
    ...(input.extraItems ?? []),
  ];

  if (contextOptions.includeInstructions !== false) {
    items.push(...await loadInstructionItems({
      cwd: input.cwd,
      ...(contextOptions.instructionRoot ? { root: contextOptions.instructionRoot } : {}),
      ...(contextOptions.instructionMaxChars ? { maxChars: contextOptions.instructionMaxChars } : {}),
    }));
  }

  if (contextOptions.includeRuntime !== false) {
    items.push(...await buildRuntimeContextItems({
      cwd: input.cwd,
      includeGit: contextOptions.includeGit,
      now: contextOptions.now,
    }));
  }

  return items;
}

function approvedPlanContextFallbackItems(
  approvedPlanContext: string | undefined,
  loadedSession: LoadedSession | undefined,
  profileName: AgentProfileName,
): ContextItem[] {
  if (!approvedPlanContext || loadedSession || profileName === "plan") {
    return [];
  }
  return [
    createContextItem({
      id: "plan:approved:option",
      kind: "plan",
      source: "options.approvedPlanContext",
      content: approvedPlanContext,
      priority: 40,
      sticky: true,
      cacheStable: false,
      metadata: { status: "approved" },
    }),
  ];
}
