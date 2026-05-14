import type { Writable } from "node:stream";

import type { UiEvent } from "../../foundation/ui-event.js";

export interface PlainRendererStreams {
  stdout: Pick<Writable, "write">;
  stderr: Pick<Writable, "write">;
}

export class PlainRenderer {
  private readonly stdout: Pick<Writable, "write">;
  private readonly stderr: Pick<Writable, "write">;

  constructor(streams: PlainRendererStreams) {
    this.stdout = streams.stdout;
    this.stderr = streams.stderr;
  }

  render(event: UiEvent): void {
    renderPlainUiEvent(event, {
      stdout: this.stdout,
      stderr: this.stderr,
    });
  }
}

export function renderPlainUiEvent(event: UiEvent, streams: PlainRendererStreams): void {
  if (event.type === "text_delta") {
    streams.stdout.write(event.delta);
    return;
  }

  if (event.type === "thinking_delta" || event.type === "turn_done") {
    return;
  }

  if (event.type === "tool_start") {
    streams.stderr.write(`[tool] ${event.summary.title}${event.summary.detail ? `: ${event.summary.detail}` : ""}\n`);
    return;
  }

  if (event.type === "tool_result") {
    streams.stderr.write(`[tool] ${event.ok ? "done" : "failed"}: ${event.summary}\n`);
    return;
  }

  if (event.type === "bash_progress") {
    streams.stderr.write(event.output);
    return;
  }

  if (event.type === "approval_request") {
    streams.stderr.write(`[approval] ${event.title}\n${event.body}\n`);
    return;
  }

  if (event.type === "question_request") {
    streams.stderr.write(`[question] ${event.questions.map((question) => question.question).join(" ")}\n`);
    return;
  }

  if (event.type === "plan_approval_request") {
    streams.stderr.write(`[plan] Approval requested: ${event.planPath}\n${event.planBody}\n`);
    return;
  }

  if (event.type === "turn_aborted") {
    streams.stderr.write(`[aborted] ${event.reason}\n`);
    return;
  }

  if (event.type === "turn_error") {
    streams.stderr.write(`[error] ${event.summary}\n`);
  }
}
