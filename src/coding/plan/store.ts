import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

import type { LoadedSession, TranscriptPart } from "../../session/types.js";

const PLAN_PREVIEW_CHARS = 4000;
const APPROVED_PLAN_CONTEXT_CHARS = 12000;

export interface PlanFile {
  path: string;
  createdAt: string;
  slug: string;
  sessionId?: string;
}

export interface PlanWriteResult extends PlanFile {
  updatedAt: string;
  bytes: number;
  preview: string;
}

export interface PlanStoreOptions {
  cwd: string;
  userPlanDir?: string;
  now?: () => Date;
}

export class PlanStore {
  private readonly cwd: string;
  private readonly userPlanDir: string;
  private readonly now: () => Date;
  private readonly activeBySession = new Map<string, PlanFile>();

  constructor(options: PlanStoreOptions) {
    this.cwd = options.cwd;
    this.userPlanDir = options.userPlanDir ?? path.join(homedir(), ".kai-code-agent", "plans");
    this.now = options.now ?? (() => new Date());
  }

  async ensurePlan(sessionId: string, slugSource = "plan"): Promise<PlanFile> {
    const active = this.activeBySession.get(sessionId);
    if (active) {
      return active;
    }
    return this.createPlan(sessionId, slugSource);
  }

  activatePlan(sessionId: string, planPath: string): PlanFile {
    const plan: PlanFile = {
      path: planPath,
      createdAt: this.now().toISOString(),
      slug: path.basename(planPath, ".md"),
      sessionId,
    };
    this.activeBySession.set(sessionId, plan);
    return plan;
  }

  async createPlan(sessionId: string, slugSource = "plan"): Promise<PlanFile> {
    const created = this.now().toISOString();
    const slug = slugify(slugSource || "plan");
    const filename = `${created.replace(/[:.]/g, "-")}-${slug}.md`;
    const dir = await this.resolveWritablePlanDir();
    const plan: PlanFile = {
      path: path.join(dir, filename),
      createdAt: created,
      slug,
      sessionId,
    };
    await writeFile(plan.path, "", { flag: "wx" });
    this.activeBySession.set(sessionId, plan);
    return plan;
  }

  async writePlan(input: { sessionId: string; content: string; slugSource?: string }): Promise<PlanWriteResult> {
    const plan = await this.ensurePlan(input.sessionId, input.slugSource);
    await writeFile(plan.path, input.content, "utf8");
    const updatedAt = this.now().toISOString();
    const bytes = Buffer.byteLength(input.content);
    return {
      ...plan,
      updatedAt,
      bytes,
      preview: boundText(input.content, PLAN_PREVIEW_CHARS),
    };
  }

  async readPlan(sessionIdOrPath: string): Promise<{ path: string; content: string; preview: string; bytes: number }> {
    const planPath = path.isAbsolute(sessionIdOrPath)
      ? sessionIdOrPath
      : (await this.ensurePlan(sessionIdOrPath)).path;
    const content = await readFile(planPath, "utf8");
    return {
      path: planPath,
      content,
      preview: boundText(content, PLAN_PREVIEW_CHARS),
      bytes: Buffer.byteLength(content),
    };
  }

  async findLatestPlan(sessionId?: string): Promise<PlanFile | undefined> {
    const dirs = [
      path.join(this.cwd, ".kai", "plans"),
      this.userPlanDir,
    ];
    const candidates: Array<{ filePath: string; mtimeMs: number }> = [];
    for (const dir of dirs) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".md")) {
            continue;
          }
          const filePath = path.join(dir, entry.name);
          const info = await stat(filePath);
          candidates.push({ filePath, mtimeMs: info.mtimeMs });
        }
      } catch {
        // Missing dirs are normal before plan mode creates its first plan.
      }
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const latest = candidates[0];
    if (!latest) {
      return undefined;
    }
    const plan: PlanFile = {
      path: latest.filePath,
      createdAt: new Date(latest.mtimeMs).toISOString(),
      slug: path.basename(latest.filePath, ".md"),
      sessionId,
    };
    if (sessionId) {
      this.activeBySession.set(sessionId, plan);
    }
    return plan;
  }

  async resolveWritablePlanDir(): Promise<string> {
    const projectDir = path.join(this.cwd, ".kai", "plans");
    try {
      await mkdir(projectDir, { recursive: true });
      return projectDir;
    } catch {
      await mkdir(this.userPlanDir, { recursive: true });
      return this.userPlanDir;
    }
  }
}

export function findActivePlanPath(loaded: LoadedSession | undefined): string | undefined {
  if (!loaded) {
    return undefined;
  }
  for (const message of [...loaded.messages].reverse()) {
    const messagePlanPath = stringFromUnknown(message.metadata.planPath)
      ?? stringFromUnknown(message.metadata.activePlanPath);
    if (messagePlanPath) {
      return messagePlanPath;
    }
    for (const part of [...message.parts].reverse()) {
      const partPlanPath = stringFromUnknown(part.metadata.planPath)
        ?? stringFromUnknown(part.metadata.activePlanPath);
      if (partPlanPath) {
        return partPlanPath;
      }
    }
  }
  const sessionPlanPath = stringFromUnknown(loaded.session.metadata.planPath)
    ?? stringFromUnknown(loaded.session.metadata.activePlanPath);
  return sessionPlanPath;
}

export function approvedPlanContextFromSession(loaded: LoadedSession | undefined): string | undefined {
  const approved = latestPlanPart(loaded, "approved");
  if (!approved) {
    return undefined;
  }
  const content = stringFromUnknown(approved.metadata.approvedPlan)
    ?? approved.text
    ?? stringFromUnknown(approved.metadata.preview);
  if (!content) {
    return undefined;
  }
  const planPath = stringFromUnknown(approved.metadata.planPath);
  return boundText([
    "Approved implementation plan:",
    planPath ? `Path: ${planPath}` : undefined,
    content,
  ].filter(Boolean).join("\n"), APPROVED_PLAN_CONTEXT_CHARS);
}

export function latestPlanPart(
  loaded: LoadedSession | undefined,
  status?: "approved" | "rejected" | "updated" | "entered",
): TranscriptPart | undefined {
  if (!loaded) {
    return undefined;
  }
  for (const message of [...loaded.messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type !== "summary" || part.metadata.kind !== "plan") {
        continue;
      }
      if (status && part.metadata.status !== status) {
        continue;
      }
      return part;
    }
  }
  return undefined;
}

export function boundPlanContext(text: string): string {
  return boundText(text, APPROVED_PLAN_CONTEXT_CHARS);
}

export function boundPlanPreview(text: string): string {
  return boundText(text, PLAN_PREVIEW_CHARS);
}

function boundText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n[truncated ${text.length - limit} chars]`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "plan";
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
