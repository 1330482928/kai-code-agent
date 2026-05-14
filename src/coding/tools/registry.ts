import type { ProviderToolSchema, ToolDef } from "../../foundation/tool.js";
import type { HumanInteractionManager } from "../../agent/human-interaction-manager.js";
import { applyPatchTool } from "./apply-patch.js";
import { createAskUserQuestionTool } from "./ask-user-question.js";
import { bashTool } from "./bash.js";
import { editFileTool } from "./edit.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { readFileTool } from "./read.js";
import { writeFileTool } from "./write.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef>();

  constructor(tools: ToolDef[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  list(): ToolDef[] {
    return [...this.tools.values()];
  }

  providerSchemas(): ProviderToolSchema[] {
    return this.list().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}

export interface DefaultToolRegistryOptions {
  humanInteractionManager?: HumanInteractionManager;
  externalTools?: ToolDef[];
}

export function createDefaultToolRegistry(options: DefaultToolRegistryOptions = {}): ToolRegistry {
  return new ToolRegistry([
    readFileTool,
    writeFileTool,
    editFileTool,
    grepTool,
    globTool,
    applyPatchTool,
    bashTool,
    createAskUserQuestionTool(options.humanInteractionManager),
    ...(options.externalTools ?? []),
  ]);
}
