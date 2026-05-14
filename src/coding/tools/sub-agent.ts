import { z } from "zod";

import { createToolFailure, type ToolDef, type ToolResult } from "../../foundation/tool.js";
import { discoverAgents, findAgentCatalogEntry } from "../../agents/discovery.js";
import { buildSubAgentContextItem } from "../../agents/context.js";
import { createSubAgentToolMailbox } from "../../agents/runner.js";
import { runSubAgent } from "../../agents/runner.js";
import type { AgentRunRuntime, AgentCatalogEntry } from "../../agents/types.js";

export const subAgentInputSchema = z.object({
  agent: z.string().min(1),
  task: z.string().min(1),
});

export interface SubAgentToolRuntime extends AgentRunRuntime {
  mailbox: ReturnType<typeof createSubAgentToolMailbox>;
}

export function createSubAgentTool(runtime: SubAgentToolRuntime): ToolDef<typeof subAgentInputSchema> {
  return {
    name: "sub_agent",
    description: "Launch an isolated sub-agent run with a bounded tool allowlist.",
    inputSchema: subAgentInputSchema,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        agent: { type: "string", description: "Agent definition name." },
        task: { type: "string", description: "Task for the child agent." },
      },
      required: ["agent", "task"],
    },
    formatPolicy: { maxModelChars: 10_000, mode: "json", includeMetadataKeys: ["subagent"] },
    async execute(input, context): Promise<ToolResult> {
      const catalog = await discoverAgents({ cwd: runtime.cwd });
      const entry = findAgentCatalogEntry(catalog, input.agent);
      if (!entry) {
        return createToolFailure("not_found", `Agent definition not found: ${input.agent}`, {
          agent: input.agent,
        });
      }

      const result = await runSubAgent({
        agent: entry,
        task: input.task,
        runtime,
        toolCallId: context.toolCallId,
        signal: context.signal,
      });
      runtime.mailbox.push(result);
      return {
        ok: true,
        output: formatSubAgentToolOutput(result),
        metadata: {
          subagent: {
            agentName: result.agentName,
            sideTranscriptId: result.sideTranscriptId,
            changedFiles: result.changedFiles,
            openQuestions: result.openQuestions,
            summary: result.summary,
          },
        },
      };
    },
  };
}

export function buildSubAgentContextItemsFromMailbox(runtime: SubAgentToolRuntime) {
  return runtime.mailbox.list().map((result) => buildSubAgentContextItem(result));
}

function formatSubAgentToolOutput(result: Awaited<ReturnType<typeof runSubAgent>>): string {
  const parts = [
    `Sub-agent ${result.agentName} completed`,
    `summary: ${result.summary}`,
    result.changedFiles.length > 0 ? `changed: ${result.changedFiles.join(", ")}` : "changed: none",
    result.openQuestions.length > 0 ? `open: ${result.openQuestions.join(", ")}` : "open: none",
    `sideTranscriptId: ${result.sideTranscriptId}`,
  ];
  return parts.join("\n");
}
