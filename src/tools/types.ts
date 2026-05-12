export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type ToolRuntimeEvent =
  | {
      type: "bash_progress";
      toolCallId: string;
      elapsedMs: number;
      totalBytes: number;
      chunk: string;
    }
  | {
      type: "tool_progress";
      toolCallId: string;
      message: string;
      metadata?: JsonObject;
    };

export interface ToolContext {
  toolCallId: string;
  cwd: string;
  emit(event: ToolRuntimeEvent): void | Promise<void>;
}

export interface ToolResult {
  output: string;
  metadata?: JsonObject;
}

export interface ToolDef<TInput extends JsonObject = JsonObject> {
  name: string;
  description: string;
  inputSchema: JsonObject;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}

