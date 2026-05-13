export type Role = "system" | "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface RunResult {
  messages: Message[];
  assistantMessage: Message;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}
