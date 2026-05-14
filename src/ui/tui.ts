import type { Readable, Writable } from "node:stream";

import { Box, Text, render, useApp, useInput } from "ink";
import React, { useMemo, useState } from "react";

import { providerPresets } from "../config/first-run.js";
import { parseModelConfig, type ModelConfig, type ModelProfile } from "../config/model-config.js";
import type { LoadedSession, PromptSubmission } from "../session/types.js";

import { ChatShell, createChatShellState } from "./chat-shell.js";
import { createCommandInputState, useCommandInput } from "./use-command-input.js";
import type { CommandRegistry, CommandResult } from "./command-registry.js";
import { maskSecret } from "./secrets.js";
import {
  buildModelConfigFromSetupDraft,
  createSetupState,
  nextSetupStep,
  selectPreset,
  selectedPreset,
  updateSetupDraft,
  validateSetupField,
  type SetupStep,
} from "./setup-state.js";

type RenderStreamOptions = {
  stdin?: Readable;
  stdout?: Writable;
  stderr?: Writable;
};

export async function runInkSetup(options: RenderStreamOptions = {}): Promise<ModelConfig> {
  const instance = render(
    React.createElement(SetupApp),
    toRenderOptions(options),
  );
  try {
    const result = await instance.waitUntilExit();
    if (result === undefined) {
      throw new Error("Model setup cancelled");
    }
    return parseModelConfig(result);
  } finally {
    instance.cleanup();
  }
}

export async function runInkTaskEntry(
  profile: ModelProfile,
  options: RenderStreamOptions = {},
): Promise<string> {
  const instance = render(
    React.createElement(TaskEntryApp, { profile }),
    toRenderOptions(options),
  );
  try {
    const result = await instance.waitUntilExit();
    if (result === undefined) {
      throw new Error("Task entry cancelled");
    }
    if (typeof result !== "string") {
      throw new Error("Task entry did not return a task");
    }
    return result;
  } finally {
    instance.cleanup();
  }
}

export async function runInkChatPrompt(
  input: {
    sessionId: string;
    loaded?: LoadedSession;
    status?: string;
    registry?: CommandRegistry;
  },
  options: RenderStreamOptions = {},
): Promise<PromptSubmission> {
  const instance = render(
    React.createElement(ChatPromptApp, input),
    toRenderOptions(options),
  );
  try {
    const result = await instance.waitUntilExit();
    if (result === undefined) {
      throw new Error("Chat prompt cancelled");
    }
    return result as PromptSubmission;
  } finally {
    instance.cleanup();
  }
}

function SetupApp(): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState(createSetupState);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const preset = selectedPreset(state);
  const title = titleForStep(state.step);
  const displayValue = state.step === "apiKey" ? maskSecret(value) : value;

  useInput((input, key) => {
    setError(null);

    if (state.step === "preset") {
      if (key.downArrow) {
        setState((current) => selectPreset(current, current.presetIndex + 1));
        return;
      }
      if (key.upArrow) {
        setState((current) => selectPreset(current, current.presetIndex - 1));
        return;
      }
      const numeric = Number.parseInt(input, 10);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= providerPresets.length) {
        const next = selectPreset(state, numeric - 1);
        setState({ ...next, step: nextSetupStep("preset", next.draft) });
        setValue("");
        return;
      }
      if (key.return) {
        setState((current) => ({
          ...current,
          step: nextSetupStep("preset", current.draft),
        }));
        setValue("");
      }
      return;
    }

    if (state.step === "confirm") {
      if (key.return || input.toLowerCase() === "y") {
        try {
          exit(buildModelConfigFromSetupDraft(state.draft));
        } catch (error_) {
          setError(error_ instanceof Error ? error_.message : String(error_));
        }
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1));
      return;
    }

    if (key.return) {
      const validationError = validateSetupField(state.step, value);
      if (validationError) {
        setError(validationError);
        return;
      }
      const draft = commitStepValue(state.step, state.draft, value);
      setState({
        ...state,
        draft,
        step: nextSetupStep(state.step, draft),
      });
      setValue("");
      return;
    }

    if (!key.ctrl && !key.meta && input.length > 0) {
      setValue((current) => current + input.replace(/\r?\n/g, ""));
    }
  });

  return React.createElement(
    Box,
    { flexDirection: "column", gap: 1 },
    React.createElement(Text, { bold: true }, "Kai model setup"),
    React.createElement(Text, null, "Configure the model profile used by Stage 01."),
    state.step === "preset"
      ? React.createElement(PresetSelect, { selectedIndex: state.presetIndex })
      : React.createElement(
          Box,
          { flexDirection: "column" },
          React.createElement(Text, { color: "cyan" }, title),
          React.createElement(
            Text,
            null,
            `${promptForStep(state.step, preset.provider)} ${displayValue}`,
          ),
        ),
    React.createElement(SetupSummary, { state }),
    error ? React.createElement(Text, { color: "red" }, error) : null,
    React.createElement(Text, { dimColor: true }, hintForStep(state.step)),
  );
}

function TaskEntryApp({ profile }: { profile: ModelProfile }): React.ReactElement {
  const { exit } = useApp();
  const [task, setTask] = useState("");
  const [error, setError] = useState<string | null>(null);
  const modelLabel = useMemo(() => `${profile.preset} / ${profile.model}`, [profile]);

  useInput((input, key) => {
    setError(null);
    if (key.backspace || key.delete) {
      setTask((current) => current.slice(0, -1));
      return;
    }
    if (key.return) {
      const trimmed = task.trim();
      if (!trimmed) {
        setError("Task is required");
        return;
      }
      exit(trimmed);
      return;
    }
    if (!key.ctrl && !key.meta && input.length > 0) {
      setTask((current) => current + input.replace(/\r?\n/g, ""));
    }
  });

  return React.createElement(
    Box,
    { flexDirection: "column", gap: 1 },
    React.createElement(Text, { bold: true }, "Kai"),
    React.createElement(Text, { dimColor: true }, modelLabel),
    React.createElement(Text, null, `Task: ${task}`),
    error ? React.createElement(Text, { color: "red" }, error) : null,
    React.createElement(Text, { dimColor: true }, "Type a task and press Enter."),
  );
}

function ChatPromptApp({
  sessionId,
  loaded,
  status,
  registry,
}: {
  sessionId: string;
  loaded?: LoadedSession;
  status?: string;
  registry?: CommandRegistry;
}): React.ReactElement {
  const { exit } = useApp();
  const [localStatus, setLocalStatus] = useState(status);
  const input = useCommandInput({
    registry,
    history: loaded?.messages
      .filter((message) => message.role === "user")
      .map((message) => message.parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join(""))
      .filter(Boolean),
    onSubmit(submission) {
      if (!submission.text.trim() && !submission.metadata) {
        setLocalStatus("Prompt is required");
        return;
      }
      exit(submission);
    },
    onLocalAction(result) {
      setLocalStatus(statusFromLocalAction(result));
    },
  });
  const state = createChatShellState({
    sessionId,
    loaded,
    input,
    status: localStatus,
  });
  return React.createElement(ChatShell, { state });
}

function statusFromLocalAction(result: CommandResult): string {
  if (result.type === "resume_session") {
    return `Use kai chat --session ${result.sessionId} to switch sessions.`;
  }
  if (result.type === "local_action" && result.action === "help") {
    return result.message ?? "";
  }
  if (result.type === "local_action" && result.action === "clear") {
    return "View cleared.";
  }
  if (result.type === "local_action" && result.action === "plan_open") {
    return "Use kai plan open --session <id> to inspect the active plan.";
  }
  return "";
}

function PresetSelect({ selectedIndex }: { selectedIndex: number }): React.ReactElement {
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { color: "cyan" }, "Provider preset"),
    ...providerPresets.map((preset, index) =>
      React.createElement(
        Text,
        { key: preset.id, color: index === selectedIndex ? "green" : undefined },
        `${index === selectedIndex ? ">" : " "} ${index + 1}. ${preset.label}`,
      ),
    ),
  );
}

function SetupSummary({ state }: { state: ReturnType<typeof createSetupState> }): React.ReactElement {
  const preset = selectedPreset(state);
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { dimColor: true }, `Preset: ${preset.label}`),
    state.draft.baseURL
      ? React.createElement(Text, { dimColor: true }, `Base URL: ${state.draft.baseURL}`)
      : null,
    state.draft.apiKey
      ? React.createElement(Text, { dimColor: true }, `API key: ${maskSecret(state.draft.apiKey)}`)
      : null,
    state.draft.model
      ? React.createElement(Text, { dimColor: true }, `Model: ${state.draft.model}`)
      : null,
  );
}

function commitStepValue(
  step: SetupStep,
  draft: ReturnType<typeof createSetupState>["draft"],
  value: string,
): ReturnType<typeof createSetupState>["draft"] {
  if (step === "provider") {
    return updateSetupDraft(draft, "provider", value.trim() || "openai");
  }
  if (step === "baseURL") {
    return updateSetupDraft(draft, "baseURL", value.trim());
  }
  if (step === "apiKey") {
    return updateSetupDraft(draft, "apiKey", value.trim());
  }
  if (step === "model") {
    return updateSetupDraft(draft, "model", value.trim());
  }
  return draft;
}

function titleForStep(step: SetupStep): string {
  if (step === "provider") {
    return "Custom provider";
  }
  if (step === "baseURL") {
    return "Custom base URL";
  }
  if (step === "apiKey") {
    return "API key";
  }
  if (step === "model") {
    return "Model name";
  }
  if (step === "confirm") {
    return "Confirm";
  }
  return "Provider preset";
}

function promptForStep(step: SetupStep, provider: string): string {
  if (step === "provider") {
    return `Provider [${provider || "openai"}]:`;
  }
  if (step === "baseURL") {
    return "Base URL:";
  }
  if (step === "apiKey") {
    return "API key:";
  }
  if (step === "model") {
    return "Model name:";
  }
  return "Press Enter to save.";
}

function hintForStep(step: SetupStep): string {
  if (step === "preset") {
    return "Use Up/Down, 1/2, then Enter.";
  }
  if (step === "confirm") {
    return "Press Enter to save this model profile.";
  }
  return "Type a value and press Enter.";
}

function toRenderOptions(options: RenderStreamOptions) {
  return {
    stdin: options.stdin as NodeJS.ReadStream | undefined,
    stdout: options.stdout as NodeJS.WriteStream | undefined,
    stderr: options.stderr as NodeJS.WriteStream | undefined,
  };
}
