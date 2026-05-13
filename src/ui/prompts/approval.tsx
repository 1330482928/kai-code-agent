import React from "react";
import { Box, Text, useInput } from "ink";

import type { ApprovalRequest } from "../../agent/human-interaction-manager.js";
import type { PromptIO } from "../../config/first-run.js";

export interface ApprovalPromptProps {
  request: ApprovalRequest;
  onSubmit(approved: boolean): void;
}

export function ApprovalPrompt({ request, onSubmit }: ApprovalPromptProps): React.ReactNode {
  useInput((input) => {
    if (input.toLowerCase() === "y") {
      onSubmit(true);
    }
    if (input.toLowerCase() === "n") {
      onSubmit(false);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="yellow">{request.title}</Text>
      <Text>{request.body}</Text>
      <Text>y approve / n deny</Text>
    </Box>
  );
}

export async function promptPlainApproval(prompt: PromptIO, request: ApprovalRequest): Promise<boolean> {
  const answer = (await prompt.question(`${request.title}\n${request.body}\nApprove? [y/N] `)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}
