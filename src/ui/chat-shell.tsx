import React from "react";
import { Box, Text } from "ink";

import type { UiEvent } from "../foundation/ui-event.js";
import type { LoadedSession, RenderedHistoryItem } from "../session/types.js";
import { projectTranscriptHistory } from "../session/projector.js";
import { RenderBatcher } from "./render-batcher.js";
import { applyTurnEvent, createTurnRendererState, TurnRenderer, type TurnRendererState } from "./ink/turn-renderer.js";
import type { CommandInputState } from "./use-command-input.js";

export interface ChatShellState {
  sessionId: string;
  history: RenderedHistoryItem[];
  currentTurn: TurnRendererState;
  input: CommandInputState;
  activeProfile: string;
  planPath?: string;
  status?: string;
}

export interface ChatShellProps {
  state: ChatShellState;
}

export function createChatShellState(input: {
  sessionId: string;
  loaded?: LoadedSession;
  input: CommandInputState;
  currentTurn?: TurnRendererState;
  activeProfile?: string;
  planPath?: string;
  status?: string;
}): ChatShellState {
  return {
    sessionId: input.sessionId,
    history: input.loaded ? projectTranscriptHistory(input.loaded) : [],
    currentTurn: input.currentTurn ?? createTurnRendererState(),
    input: input.input,
    activeProfile: input.activeProfile ?? profileFromLoaded(input.loaded),
    planPath: input.planPath ?? planPathFromLoaded(input.loaded),
    status: input.status,
  };
}

export function applyChatTurnEvent(state: ChatShellState, event: UiEvent): ChatShellState {
  if (event.type === "turn_done") {
    return {
      ...state,
      currentTurn: createTurnRendererState(),
    };
  }
  return {
    ...state,
    currentTurn: applyTurnEvent(state.currentTurn, event),
  };
}

export function createChatTurnBatcher(apply: (event: UiEvent) => void): RenderBatcher<UiEvent> {
  return new RenderBatcher<UiEvent>({
    isBoundaryEvent(event) {
      return event.type === "tool_start" || event.type === "tool_result" || event.type === "turn_done";
    },
    flush(events) {
      for (const event of events) {
        apply(event);
      }
    },
  });
}

export function ChatShell({ state }: ChatShellProps): React.ReactElement {
  const inputText = state.input.editor.text || state.input.editor.placeholder || "";
  return (
    <Box flexDirection="column">
      <Text bold>Kai</Text>
      <Text dimColor>Session {state.sessionId}</Text>
      <Text dimColor>
        Profile {state.activeProfile}{state.planPath ? ` · Plan ${state.planPath}` : ""}
      </Text>
      {state.history.map((item) => (
        <Text key={item.id}>
          {labelForRole(item.role)}: {item.text}
        </Text>
      ))}
      <TurnRenderer state={state.currentTurn} />
      <Text color="cyan">{">"} {inputText}</Text>
      {state.input.picker.open
        ? state.input.picker.items.map((item, index) => (
            <Text key={item.name} color={index === state.input.picker.selectedIndex ? "green" : undefined}>
              {index === state.input.picker.selectedIndex ? ">" : " "} /{item.name} {item.description}
            </Text>
          ))
        : null}
      {state.status ? <Text dimColor>{state.status}</Text> : null}
    </Box>
  );
}

function profileFromLoaded(loaded: LoadedSession | undefined): string {
  if (!loaded) {
    return "build";
  }
  for (const message of [...loaded.messages].reverse()) {
    const nextProfile = typeof message.metadata.nextProfile === "string" ? message.metadata.nextProfile : undefined;
    if (nextProfile) {
      return nextProfile;
    }
    const profile = typeof message.metadata.profile === "string" ? message.metadata.profile : undefined;
    if (profile) {
      return profile;
    }
  }
  return "build";
}

function planPathFromLoaded(loaded: LoadedSession | undefined): string | undefined {
  if (!loaded) {
    return undefined;
  }
  for (const message of [...loaded.messages].reverse()) {
    if (typeof message.metadata.planPath === "string") {
      return message.metadata.planPath;
    }
    for (const part of [...message.parts].reverse()) {
      if (typeof part.metadata.planPath === "string") {
        return part.metadata.planPath;
      }
    }
  }
  return undefined;
}

function labelForRole(role: RenderedHistoryItem["role"]): string {
  if (role === "assistant") {
    return "Assistant";
  }
  if (role === "tool") {
    return "Tool";
  }
  return "User";
}
