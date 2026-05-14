import React from "react";
import { Box, Text } from "ink";

import type { UiEvent } from "../../foundation/ui-event.js";
import type { ToolStateEntry } from "../../agent/tool-state.js";

export interface TurnRendererState {
  text: string;
  tools: ToolStateEntry[];
  abortedReason?: string;
  errorSummary?: string;
}

export interface TurnRendererProps {
  state: TurnRendererState;
}

export function createTurnRendererState(): TurnRendererState {
  return {
    text: "",
    tools: [],
  };
}

export function applyTurnEvent(state: TurnRendererState, event: UiEvent): TurnRendererState {
  if (event.type === "text_delta") {
    return {
      ...state,
      text: state.text + event.delta,
    };
  }

  if (event.type === "tool_start") {
    return {
      ...state,
      tools: [
        ...state.tools,
        {
          id: event.id,
          name: event.name,
          summary: event.summary,
          status: "running",
        },
      ],
    };
  }

  if (event.type === "tool_result") {
    return {
      ...state,
      tools: state.tools.map((tool) => (
        tool.id === event.id
          ? { ...tool, status: event.ok ? "completed" : "failed", ok: event.ok, resultSummary: event.summary }
          : tool
      )),
    };
  }

  if (event.type === "turn_error") {
    return {
      ...state,
      errorSummary: event.summary,
    };
  }

  if (event.type === "turn_aborted") {
    return {
      ...state,
      abortedReason: event.reason,
    };
  }

  return state;
}

export function TurnRenderer({ state }: TurnRendererProps): React.ReactNode {
  return (
    <Box flexDirection="column">
      {state.text.length > 0 ? <Text>{state.text}</Text> : null}
      {state.tools.map((tool) => (
        <Text key={tool.id} color={tool.ok === false ? "red" : "cyan"}>
          {toolStatusLabel(tool)} {tool.summary.title}
          {tool.summary.detail ? `: ${tool.summary.detail}` : ""}
        </Text>
      ))}
      {state.errorSummary ? <Text color="red">error: {state.errorSummary}</Text> : null}
      {state.abortedReason ? <Text color="yellow">aborted: {state.abortedReason}</Text> : null}
    </Box>
  );
}

function toolStatusLabel(tool: ToolStateEntry): string {
  if (tool.status === "running") {
    return "running";
  }
  if (tool.status === "backfilled") {
    return "failed";
  }
  if (tool.status === "interrupted") {
    return "interrupted";
  }
  return tool.ok === false ? "failed" : "done";
}
