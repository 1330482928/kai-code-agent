import { useState } from "react";
import { useInput } from "ink";

import type { PromptSubmission } from "../session/types.js";

import {
  createInputEditorState,
  reduceInputEditor,
  type InputEditorState,
} from "./input-editor.js";
import {
  createDefaultCommandRegistry,
  type CommandEntry,
  type CommandRegistry,
  type CommandResult,
} from "./command-registry.js";

export interface CommandInputState {
  editor: InputEditorState;
  picker: {
    open: boolean;
    items: CommandEntry[];
    selectedIndex: number;
  };
  history: string[];
}

export type CommandInputOutput =
  | { type: "none" }
  | { type: "submit"; submission: PromptSubmission }
  | { type: "local_action"; result: CommandResult }
  | { type: "abort_turn" };

export interface CommandInputKey {
  return?: boolean;
  tab?: boolean;
  escape?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export function createCommandInputState(input: {
  history?: string[];
  placeholder?: string;
  registry?: CommandRegistry;
} = {}): CommandInputState {
  const registry = input.registry ?? createDefaultCommandRegistry();
  return {
    editor: createInputEditorState({ history: input.history ?? [], placeholder: input.placeholder }),
    picker: { open: false, items: registry.entries(), selectedIndex: 0 },
    history: input.history ?? [],
  };
}

export function applyCommandInput(
  state: CommandInputState,
  input: string,
  key: CommandInputKey,
  options: { registry?: CommandRegistry; running?: boolean } = {},
): { state: CommandInputState; output: CommandInputOutput } {
  const registry = options.registry ?? createDefaultCommandRegistry();

  if (options.running && key.ctrl && input === "c") {
    return { state, output: { type: "abort_turn" } };
  }

  if (state.picker.open) {
    if (key.escape) {
      return { state: { ...state, picker: { ...state.picker, open: false } }, output: { type: "none" } };
    }
    if (key.upArrow) {
      return {
        state: {
          ...state,
          picker: {
            ...state.picker,
            selectedIndex: clamp(state.picker.selectedIndex - 1, 0, state.picker.items.length - 1),
          },
        },
        output: { type: "none" },
      };
    }
    if (key.downArrow) {
      return {
        state: {
          ...state,
          picker: {
            ...state.picker,
            selectedIndex: clamp(state.picker.selectedIndex + 1, 0, state.picker.items.length - 1),
          },
        },
        output: { type: "none" },
      };
    }
    if (key.tab || key.return) {
      const selected = state.picker.items[state.picker.selectedIndex];
      const commandText = key.return && state.editor.text.trim().length > 1
        ? state.editor.text
        : selected
          ? `/${selected.name}`
          : state.editor.text;
      const result = registry.resolve(commandText);
      return applyCommandResult(state, result);
    }
  }

  if (key.return) {
    const text = state.editor.text.trim();
    if (!text) {
      return { state, output: { type: "none" } };
    }
    if (text.startsWith("/")) {
      return applyCommandResult(state, registry.resolve(text));
    }
    return {
      state: addHistory({ ...state, editor: reduceInputEditor(state.editor, { type: "clear" }) }, text),
      output: { type: "submit", submission: { text } },
    };
  }

  if (key.leftArrow) {
    return { state: { ...state, editor: reduceInputEditor(state.editor, { type: "move_left" }) }, output: { type: "none" } };
  }
  if (key.rightArrow) {
    return { state: { ...state, editor: reduceInputEditor(state.editor, { type: "move_right" }) }, output: { type: "none" } };
  }
  if (key.upArrow) {
    return { state: { ...state, editor: reduceInputEditor(state.editor, { type: "history_prev" }) }, output: { type: "none" } };
  }
  if (key.downArrow) {
    return { state: { ...state, editor: reduceInputEditor(state.editor, { type: "history_next" }) }, output: { type: "none" } };
  }
  if (key.backspace) {
    const editor = reduceInputEditor(state.editor, { type: "backspace" });
    return withPicker({ ...state, editor }, registry);
  }
  if (key.delete) {
    const editor = reduceInputEditor(state.editor, { type: "delete" });
    return withPicker({ ...state, editor }, registry);
  }
  if (!key.ctrl && !key.meta && input.length > 0) {
    const editor = reduceInputEditor(state.editor, { type: "insert", text: input.replace(/\r?\n/g, "") });
    return withPicker({ ...state, editor }, registry);
  }

  return { state, output: { type: "none" } };
}

export function useCommandInput(options: {
  registry?: CommandRegistry;
  running?: boolean;
  history?: string[];
  onSubmit?: (submission: PromptSubmission) => void;
  onLocalAction?: (result: CommandResult) => void;
  onAbort?: () => void;
} = {}): CommandInputState {
  const registry = options.registry ?? createDefaultCommandRegistry();
  const [state, setState] = useState(() => createCommandInputState({ history: options.history, registry }));

  useInput((input, key) => {
    const result = applyCommandInput(state, input, key, { registry, running: options.running });
    setState(result.state);
    if (result.output.type === "submit") {
      options.onSubmit?.(result.output.submission);
    } else if (result.output.type === "local_action") {
      options.onLocalAction?.(result.output.result);
    } else if (result.output.type === "abort_turn") {
      options.onAbort?.();
    }
  });

  return state;
}

function applyCommandResult(
  state: CommandInputState,
  result: CommandResult,
): { state: CommandInputState; output: CommandInputOutput } {
  if (result.type === "input_transform") {
    return {
      state: {
        ...state,
        editor: reduceInputEditor(state.editor, { type: "set_text", text: result.text, cursor: result.cursor }),
        picker: { ...state.picker, open: false },
      },
      output: { type: "none" },
    };
  }
  if (result.type === "prompt_submission") {
    return {
      state: addHistory({
        ...state,
        editor: reduceInputEditor(state.editor, { type: "clear" }),
        picker: { ...state.picker, open: false },
      }, state.editor.text.trim()),
      output: { type: "submit", submission: result.submission },
    };
  }
  return {
    state: {
      ...state,
      editor: reduceInputEditor(state.editor, { type: "clear" }),
      picker: { ...state.picker, open: false },
    },
    output: { type: "local_action", result },
  };
}

function withPicker(
  state: CommandInputState,
  registry: CommandRegistry,
): { state: CommandInputState; output: CommandInputOutput } {
  if (state.editor.text.startsWith("/")) {
    const items = registry.match(state.editor.text);
    return {
      state: {
        ...state,
        picker: {
          open: state.editor.text === "/" || items.length > 0,
          items,
          selectedIndex: clamp(state.picker.selectedIndex, 0, Math.max(items.length - 1, 0)),
        },
      },
      output: { type: "none" },
    };
  }
  return {
    state: { ...state, picker: { ...state.picker, open: false } },
    output: { type: "none" },
  };
}

function addHistory(state: CommandInputState, text: string): CommandInputState {
  if (!text) {
    return state;
  }
  const history = [...state.history, text];
  return {
    ...state,
    history,
    editor: {
      ...state.editor,
      history,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
