import type { Message, RunResult } from "../foundation/message.js";
import type { ProviderInput } from "../provider/types.js";
import type { ExecutableToolUse, ToolResult } from "../foundation/tool.js";
import type { ContextItem, ModelInputBuildResult } from "../coding/context/items.js";
import type { PromptSubmission } from "../session/types.js";

export interface MiddlewareContextBase {
  sessionId: string;
  cwd: string;
  signal: AbortSignal;
}

export interface AgentRunContext extends MiddlewareContextBase {
  task: string;
  model: string;
}

export interface AgentRunAfterContext extends AgentRunContext {
  status: "success" | "error" | "aborted";
  result?: RunResult;
  error?: unknown;
}

export interface ContextItemsContext extends MiddlewareContextBase {
  task: string;
  messages: Message[];
  promptSubmission?: PromptSubmission;
  profileName?: string;
}

export interface ModelContext extends MiddlewareContextBase {
  input: ProviderInput;
  messages: Message[];
  contextItems?: ContextItem[];
  contextBuild?: ModelInputBuildResult;
}

export interface ModelAfterContext extends ModelContext {
  output: {
    assistantText: string;
    toolCalls: ExecutableToolUse[];
  };
}

export interface ToolUseContext extends MiddlewareContextBase {
  toolUse: ExecutableToolUse;
}

export interface ToolUseAfterContext extends ToolUseContext {
  result: ToolResult;
}

export interface AgentMiddleware {
  name?: string;
  beforeAgentRun?(context: AgentRunContext): void | Promise<void>;
  afterAgentRun?(context: AgentRunAfterContext): void | Promise<void>;
  contextItems?(context: ContextItemsContext): ContextItem[] | void | Promise<ContextItem[] | void>;
  beforeModel?(context: ModelContext): ProviderInput | void | Promise<ProviderInput | void>;
  afterModel?(context: ModelAfterContext): void | Promise<void>;
  beforeToolUse?(context: ToolUseContext): ToolResult | void | Promise<ToolResult | void>;
  afterToolUse?(context: ToolUseAfterContext): ToolResult | void | Promise<ToolResult | void>;
}

export class MiddlewarePipeline {
  private readonly middleware: AgentMiddleware[];

  constructor(middleware: AgentMiddleware[] = []) {
    this.middleware = middleware;
  }

  async beforeAgentRun(context: AgentRunContext): Promise<void> {
    for (const middleware of this.middleware) {
      throwIfAborted(context.signal);
      await middleware.beforeAgentRun?.(context);
    }
  }

  async afterAgentRun(context: AgentRunAfterContext): Promise<void> {
    for (const middleware of this.middleware) {
      await middleware.afterAgentRun?.(context);
    }
  }

  async contextItems(context: ContextItemsContext): Promise<ContextItem[]> {
    const items: ContextItem[] = [];
    for (const middleware of this.middleware) {
      throwIfAborted(context.signal);
      const contributed = await middleware.contextItems?.(context);
      if (contributed) {
        items.push(...contributed);
      }
    }
    return items;
  }

  async beforeModel(context: ModelContext): Promise<ProviderInput> {
    let input = context.input;
    for (const middleware of this.middleware) {
      throwIfAborted(context.signal);
      const replacement = await middleware.beforeModel?.({ ...context, input });
      if (replacement) {
        input = replacement;
      }
    }
    return input;
  }

  async afterModel(context: ModelAfterContext): Promise<void> {
    for (const middleware of this.middleware) {
      throwIfAborted(context.signal);
      await middleware.afterModel?.(context);
    }
  }

  async beforeToolUse(context: ToolUseContext): Promise<ToolResult | undefined> {
    for (const middleware of this.middleware) {
      throwIfAborted(context.signal);
      const intercepted = await middleware.beforeToolUse?.(context);
      if (intercepted) {
        return intercepted;
      }
    }
    return undefined;
  }

  async afterToolUse(context: ToolUseAfterContext): Promise<ToolResult> {
    let result = context.result;
    for (const middleware of this.middleware) {
      throwIfAborted(context.signal);
      const replacement = await middleware.afterToolUse?.({ ...context, result });
      if (replacement) {
        result = replacement;
      }
    }
    return result;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Operation was aborted", "AbortError");
  }
}
