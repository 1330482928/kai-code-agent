import type { PromptSubmission } from "../session/types.js";

export type LocalCommandAction = "help" | "clear" | "plan_open";

export type CommandResult =
  | { type: "local_action"; action: LocalCommandAction; message?: string }
  | { type: "input_transform"; text: string; cursor?: number }
  | { type: "prompt_submission"; submission: PromptSubmission }
  | { type: "resume_session"; sessionId: string };

export interface CommandEntry {
  name: string;
  description: string;
  usage: string;
  run(args: string[]): CommandResult;
}

export interface CommandRegistry {
  entries(): CommandEntry[];
  match(input: string): CommandEntry[];
  resolve(input: string): CommandResult;
}

export function createDefaultCommandRegistry(): CommandRegistry {
  const entries: CommandEntry[] = [
    {
      name: "help",
      description: "Show commands",
      usage: "/help",
      run() {
        return {
          type: "local_action",
          action: "help",
          message: entries.map((entry) => `${entry.usage} - ${entry.description}`).join("\n"),
        };
      },
    },
    {
      name: "clear",
      description: "Clear the current view",
      usage: "/clear",
      run() {
        return { type: "local_action", action: "clear" };
      },
    },
    {
      name: "resume",
      description: "Switch to a session",
      usage: "/resume <session-id>",
      run(args) {
        const sessionId = args[0];
        if (!sessionId) {
          return { type: "input_transform", text: "/resume " };
        }
        return { type: "resume_session", sessionId };
      },
    },
    {
      name: "model",
      description: "Submit with model metadata",
      usage: "/model <name> [prompt]",
      run(args) {
        const [model, ...prompt] = args;
        return {
          type: "prompt_submission",
          submission: {
            text: prompt.join(" ").trim(),
            metadata: { slashCommand: "model", requestedModel: model ?? "" },
          },
        };
      },
    },
    {
      name: "mode",
      description: "Submit with mode metadata",
      usage: "/mode <name> [prompt]",
      run(args) {
        const [mode, ...prompt] = args;
        return {
          type: "prompt_submission",
          submission: {
            text: prompt.join(" ").trim(),
            metadata: { slashCommand: "mode", requestedMode: mode ?? "" },
          },
        };
      },
    },
    {
      name: "plan",
      description: "Submit in plan mode",
      usage: "/plan [open|prompt]",
      run(args) {
        if (args[0] === "open") {
          return {
            type: "local_action",
            action: "plan_open",
          };
        }
        return {
          type: "prompt_submission",
          submission: {
            text: args.join(" ").trim(),
            metadata: { slashCommand: "plan", requestedMode: "plan", requestedProfile: "plan" },
          },
        };
      },
    },
  ];

  return {
    entries() {
      return entries;
    },
    match(input: string) {
      const name = parseCommand(input).name;
      return entries.filter((entry) => entry.name.startsWith(name));
    },
    resolve(input: string) {
      const parsed = parseCommand(input);
      const entry = entries.find((candidate) => candidate.name === parsed.name);
      if (!entry) {
        return { type: "input_transform", text: input };
      }
      return entry.run(parsed.args);
    },
  };
}

export function parseCommand(input: string): { name: string; args: string[] } {
  const trimmed = input.trim();
  const withoutSlash = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const parts = withoutSlash.split(/\s+/).filter(Boolean);
  const [name = "", ...args] = parts;
  return { name, args };
}
