import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

import type { QuestionRequest } from "../../agent/human-interaction-manager.js";
import type { QuestionPromptInput } from "../../foundation/ui-event.js";
import type { PromptIO } from "../../config/first-run.js";

export interface AskUserQuestionPromptProps {
  request: QuestionRequest;
  onSubmit(answers: Record<string, string[]>): void;
}

export function AskUserQuestionPrompt({ request, onSubmit }: AskUserQuestionPromptProps): React.ReactNode {
  const [selected, setSelected] = useState(0);
  const question = request.questions[0];

  useInput((_input, key) => {
    if (!question) {
      onSubmit({});
      return;
    }
    if (key.upArrow) {
      setSelected(Math.max(0, selected - 1));
    }
    if (key.downArrow) {
      setSelected(Math.min(question.options.length - 1, selected + 1));
    }
    if (key.return) {
      const option = question.options[selected];
      onSubmit({ [question.id]: option ? [option.label] : [] });
    }
  });

  if (!question) {
    return <Text>No question</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text color="yellow">{question.question}</Text>
      {question.options.map((option, index) => (
        <Text key={option.label} color={index === selected ? "cyan" : undefined}>
          {index === selected ? "> " : "  "}{option.label}
        </Text>
      ))}
    </Box>
  );
}

export async function promptPlainQuestion(
  prompt: PromptIO,
  questions: QuestionPromptInput[],
): Promise<Record<string, string[]>> {
  const answers: Record<string, string[]> = {};
  for (const question of questions) {
    const lines = question.options.map((option, index) => `${index + 1}. ${option.label}`).join("\n");
    const answer = (await prompt.question(`${question.question}\n${lines}\nChoice [1]: `)).trim();
    const index = answer ? Number.parseInt(answer, 10) - 1 : 0;
    const option = question.options[index] ?? question.options[0];
    answers[question.id] = option ? [option.label] : [];
  }
  return answers;
}
