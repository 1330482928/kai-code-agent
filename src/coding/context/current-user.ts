import type { JsonObject } from "../../foundation/tool.js";
import type { PromptSubmission } from "../../session/types.js";

import { createContextItem, type ContextItem } from "./items.js";

export interface CurrentUserContextInput {
  task: string;
  submission?: PromptSubmission;
  priority?: number;
}

export function createCurrentUserContextItem(input: CurrentUserContextInput): ContextItem {
  const metadata: JsonObject = {
    role: "user",
    current: true,
    ...(input.submission?.metadata ? { submission: input.submission.metadata as JsonObject } : {}),
  };
  return createContextItem({
    id: "current-user:prompt",
    kind: "current_user",
    source: "prompt.current",
    content: input.task,
    priority: input.priority ?? 1000,
    cacheStable: false,
    metadata,
  });
}
