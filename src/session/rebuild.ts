import type { Message } from "../foundation/message.js";
import {
  approvedPlanContextItemsFromSession,
  contextItemsFromLoadedSession,
  ModelInputBuilder,
} from "../coding/context/index.js";

import type { LoadedSession } from "./types.js";

export interface RebuildProviderMessagesOptions {
  includeThinking?: boolean;
}

export function rebuildProviderMessages(
  loaded: LoadedSession,
  options: RebuildProviderMessagesOptions = {},
): Message[] {
  return new ModelInputBuilder().build({
    model: "rebuild",
    items: [
      ...approvedPlanContextItemsFromSession(loaded, "build"),
      ...contextItemsFromLoadedSession(loaded, { includeThinking: options.includeThinking }),
    ],
  }).messages;
}
