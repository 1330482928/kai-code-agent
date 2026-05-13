import { z } from "zod";

import type { HumanInteractionManager } from "../../agent/human-interaction-manager.js";
import { createToolFailure, type ToolDef, type ToolResult } from "../../foundation/tool.js";

const optionSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  preview: z.string().optional(),
});

const questionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  mode: z.enum(["single", "multi"]).default("single"),
  options: z.array(optionSchema).min(1),
});

export const askUserQuestionInputSchema = z.object({
  questions: z.array(questionSchema).min(1),
});

export function createAskUserQuestionTool(manager?: HumanInteractionManager): ToolDef<typeof askUserQuestionInputSchema> {
  return {
    name: "ask_user_question",
    description: "Ask the user one or more structured questions before continuing.",
    inputSchema: askUserQuestionInputSchema,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              mode: { type: "string", enum: ["single", "multi"] },
              options: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    label: { type: "string" },
                    description: { type: "string" },
                    preview: { type: "string" },
                  },
                  required: ["label", "description"],
                },
              },
            },
            required: ["id", "question", "mode", "options"],
          },
        },
      },
      required: ["questions"],
    },
    formatPolicy: { maxModelChars: 4000, mode: "json", includeMetadataKeys: ["answers"] },
    async execute(input, context): Promise<ToolResult> {
      if (!manager) {
        return createToolFailure("permission", "No human interaction manager is available for ask_user_question");
      }
      const answers = await manager.askUserQuestion(input.questions, context.signal);
      return {
        ok: true,
        output: "User answered the question request",
        metadata: {
          answers,
        },
      };
    },
  };
}

export const askUserQuestionTool = createAskUserQuestionTool();
