import { randomUUID } from "node:crypto";

import type { QuestionPromptInput } from "../foundation/ui-event.js";

export interface ApprovalPromptInput {
  title: string;
  body: string;
}

export interface ApprovalRequest extends ApprovalPromptInput {
  type: "approval";
  id: string;
}

export interface QuestionRequest {
  type: "question";
  id: string;
  questions: QuestionPromptInput[];
}

export interface PlanApprovalPromptInput {
  sessionId: string;
  planPath: string;
  planBody: string;
  profile: string;
}

export interface PlanApprovalRequest extends PlanApprovalPromptInput {
  type: "plan_approval";
  id: string;
}

export type HumanInteractionRequest = ApprovalRequest | QuestionRequest | PlanApprovalRequest;

export type HumanInteractionResponse =
  | { type: "approval"; approved: boolean }
  | { type: "question"; answers: Record<string, string[]> }
  | { type: "plan_approval"; approved: boolean };

export type HumanInteractionListener = (request: HumanInteractionRequest) => void | Promise<void>;

interface PendingRequest {
  resolve(response: HumanInteractionResponse): void;
  reject(error: unknown): void;
}

export class HumanInteractionManager {
  private readonly listeners = new Set<HumanInteractionListener>();
  private readonly pending = new Map<string, PendingRequest>();

  onRequest(listener: HumanInteractionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async requestApproval(input: ApprovalPromptInput, signal?: AbortSignal): Promise<boolean> {
    const response = await this.enqueue({
      type: "approval",
      id: randomUUID(),
      title: input.title,
      body: input.body,
    }, signal);
    return response.type === "approval" ? response.approved : false;
  }

  async askUserQuestion(questions: QuestionPromptInput[], signal?: AbortSignal): Promise<Record<string, string[]>> {
    const response = await this.enqueue({
      type: "question",
      id: randomUUID(),
      questions,
    }, signal);
    return response.type === "question" ? response.answers : {};
  }

  async requestPlanApproval(input: PlanApprovalPromptInput, signal?: AbortSignal): Promise<boolean> {
    const response = await this.enqueue({
      type: "plan_approval",
      id: randomUUID(),
      sessionId: input.sessionId,
      planPath: input.planPath,
      planBody: input.planBody,
      profile: input.profile,
    }, signal);
    return response.type === "plan_approval" ? response.approved : false;
  }

  resolveApproval(id: string, approved: boolean): void {
    this.resolve(id, { type: "approval", approved });
  }

  resolveQuestion(id: string, answers: Record<string, string[]>): void {
    this.resolve(id, { type: "question", answers });
  }

  resolvePlanApproval(id: string, approved: boolean): void {
    this.resolve(id, { type: "plan_approval", approved });
  }

  reject(id: string, error: unknown): void {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    this.pending.delete(id);
    pending.reject(error);
  }

  pendingCount(): number {
    return this.pending.size;
  }

  private enqueue(request: HumanInteractionRequest, signal?: AbortSignal): Promise<HumanInteractionResponse> {
    if (signal?.aborted) {
      return Promise.reject(new DOMException("Operation was aborted", "AbortError"));
    }

    return new Promise((resolve, reject) => {
      const abort = () => {
        this.reject(request.id, new DOMException("Operation was aborted", "AbortError"));
      };
      const wrappedResolve = (response: HumanInteractionResponse) => {
        signal?.removeEventListener("abort", abort);
        resolve(response);
      };
      const wrappedReject = (error: unknown) => {
        signal?.removeEventListener("abort", abort);
        reject(error);
      };
      this.pending.set(request.id, {
        resolve: wrappedResolve,
        reject: wrappedReject,
      });
      signal?.addEventListener("abort", abort, { once: true });
      for (const listener of this.listeners) {
        void listener(request);
      }
    });
  }

  private resolve(id: string, response: HumanInteractionResponse): void {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    this.pending.delete(id);
    pending.resolve(response);
  }
}
