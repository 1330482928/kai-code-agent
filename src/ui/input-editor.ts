export interface InputEditorState {
  text: string;
  cursor: number;
  placeholder?: string;
  history: string[];
  historyIndex?: number;
  draftBeforeHistory?: string;
}

export type InputEditorAction =
  | { type: "insert"; text: string }
  | { type: "move_left" }
  | { type: "move_right" }
  | { type: "move_start" }
  | { type: "move_end" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "set_text"; text: string; cursor?: number }
  | { type: "clear" }
  | { type: "history_prev" }
  | { type: "history_next" };

export function createInputEditorState(input: Partial<InputEditorState> = {}): InputEditorState {
  const text = input.text ?? "";
  return {
    text,
    cursor: clamp(input.cursor ?? text.length, 0, text.length),
    placeholder: input.placeholder,
    history: input.history ?? [],
    historyIndex: input.historyIndex,
    draftBeforeHistory: input.draftBeforeHistory,
  };
}

export function reduceInputEditor(state: InputEditorState, action: InputEditorAction): InputEditorState {
  if (action.type === "insert") {
    const text = `${state.text.slice(0, state.cursor)}${action.text}${state.text.slice(state.cursor)}`;
    return resetHistory({ ...state, text, cursor: state.cursor + action.text.length });
  }
  if (action.type === "move_left") {
    return { ...state, cursor: clamp(state.cursor - 1, 0, state.text.length) };
  }
  if (action.type === "move_right") {
    return { ...state, cursor: clamp(state.cursor + 1, 0, state.text.length) };
  }
  if (action.type === "move_start") {
    return { ...state, cursor: 0 };
  }
  if (action.type === "move_end") {
    return { ...state, cursor: state.text.length };
  }
  if (action.type === "backspace") {
    if (state.cursor === 0) {
      return state;
    }
    const text = `${state.text.slice(0, state.cursor - 1)}${state.text.slice(state.cursor)}`;
    return resetHistory({ ...state, text, cursor: state.cursor - 1 });
  }
  if (action.type === "delete") {
    if (state.cursor >= state.text.length) {
      return state;
    }
    const text = `${state.text.slice(0, state.cursor)}${state.text.slice(state.cursor + 1)}`;
    return resetHistory({ ...state, text, cursor: state.cursor });
  }
  if (action.type === "set_text") {
    return resetHistory({
      ...state,
      text: action.text,
      cursor: clamp(action.cursor ?? action.text.length, 0, action.text.length),
    });
  }
  if (action.type === "clear") {
    return resetHistory({ ...state, text: "", cursor: 0 });
  }
  if (action.type === "history_prev") {
    if (state.history.length === 0) {
      return state;
    }
    const currentIndex = state.historyIndex ?? state.history.length;
    const nextIndex = clamp(currentIndex - 1, 0, state.history.length - 1);
    const text = state.history[nextIndex] ?? "";
    return {
      ...state,
      text,
      cursor: text.length,
      historyIndex: nextIndex,
      draftBeforeHistory: state.historyIndex === undefined ? state.text : state.draftBeforeHistory,
    };
  }
  if (action.type === "history_next") {
    if (state.history.length === 0 || state.historyIndex === undefined) {
      return state;
    }
    const nextIndex = state.historyIndex + 1;
    if (nextIndex >= state.history.length) {
      const text = state.draftBeforeHistory ?? "";
      return {
        ...state,
        text,
        cursor: text.length,
        historyIndex: undefined,
        draftBeforeHistory: undefined,
      };
    }
    const text = state.history[nextIndex] ?? "";
    return {
      ...state,
      text,
      cursor: text.length,
      historyIndex: nextIndex,
    };
  }
  return state;
}

export function editorDisplayText(state: InputEditorState): string {
  return state.text || state.placeholder || "";
}

function resetHistory(state: InputEditorState): InputEditorState {
  return {
    ...state,
    historyIndex: undefined,
    draftBeforeHistory: undefined,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
