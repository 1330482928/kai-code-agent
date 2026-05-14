import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";
import { once } from "node:events";
import type { Readable } from "node:stream";

export interface RuntimeFile {
  exists(): Promise<boolean>;
  text(): Promise<string>;
}

export interface RuntimeShellResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  interrupted: boolean;
  interruptedReason?: "timeout" | "abort";
}

export interface RuntimeShellOutputChunk {
  stream: "stdout" | "stderr";
  text: string;
}

interface BunLike {
  file(path: string): RuntimeFile;
  write(path: string, content: string): Promise<number>;
  spawn(args: string[], options: {
    cwd?: string;
    stdout?: "pipe";
    stderr?: "pipe";
    signal?: AbortSignal;
  }): {
    stdout?: ReadableStream<Uint8Array>;
    stderr?: ReadableStream<Uint8Array>;
    exited: Promise<number>;
    kill(signal?: string): void;
  };
}

export function runtimeFile(filePath: string): RuntimeFile {
  const bun = bunRuntime();
  if (bun) {
    return bun.file(filePath);
  }

  return {
    async exists() {
      try {
        await stat(filePath);
        return true;
      } catch {
        return false;
      }
    },
    async text() {
      return readFile(filePath, "utf8");
    },
  };
}

export async function runtimeWrite(filePath: string, content: string): Promise<number> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const bun = bunRuntime();
  if (bun) {
    return bun.write(filePath, content);
  }
  await writeFile(filePath, content, "utf8");
  return Buffer.byteLength(content);
}

export async function runtimeSpawnShell(options: {
  command: string;
  cwd: string;
  signal: AbortSignal;
  timeoutMs: number;
  onOutput?: (chunk: RuntimeShellOutputChunk) => void | Promise<void>;
}): Promise<RuntimeShellResult> {
  const bun = bunRuntime();
  if (bun) {
    return runBunShell(bun, options);
  }
  return runNodeShell(options);
}

function bunRuntime(): BunLike | undefined {
  const candidate = (globalThis as { Bun?: BunLike }).Bun;
  return candidate;
}

async function runBunShell(
  bun: BunLike,
  options: {
    command: string;
    cwd: string;
    signal: AbortSignal;
    timeoutMs: number;
    onOutput?: (chunk: RuntimeShellOutputChunk) => void | Promise<void>;
  },
): Promise<RuntimeShellResult> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), options.timeoutMs);
  const signal = AbortSignal.any([options.signal, timeout.signal]);
  const proc = bun.spawn(["/bin/sh", "-lc", options.command], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
    signal,
  });

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readWebStream(proc.stdout, (text) => options.onOutput?.({ stream: "stdout", text })),
      readWebStream(proc.stderr, (text) => options.onOutput?.({ stream: "stderr", text })),
      proc.exited.catch(() => null),
    ]);
    return {
      stdout,
      stderr,
      exitCode,
      interrupted: timeout.signal.aborted || options.signal.aborted,
      ...(timeout.signal.aborted || options.signal.aborted
        ? { interruptedReason: options.signal.aborted ? "abort" as const : "timeout" as const }
        : {}),
    };
  } finally {
    clearTimeout(timer);
    if (timeout.signal.aborted || options.signal.aborted) {
      proc.kill("SIGTERM");
    }
  }
}

async function runNodeShell(options: {
  command: string;
  cwd: string;
  signal: AbortSignal;
  timeoutMs: number;
  onOutput?: (chunk: RuntimeShellOutputChunk) => void | Promise<void>;
}): Promise<RuntimeShellResult> {
  const child = nodeSpawn("/bin/sh", ["-lc", options.command], {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks = {
    stdout: readNodeStream(child.stdout, (text) => options.onOutput?.({ stream: "stdout", text })),
    stderr: readNodeStream(child.stderr, (text) => options.onOutput?.({ stream: "stderr", text })),
  };
  let interrupted = false;
  let interruptedReason: RuntimeShellResult["interruptedReason"];
  const interrupt = (reason: "timeout" | "abort") => {
    if (!interrupted) {
      interrupted = true;
      interruptedReason = reason;
      child.kill("SIGTERM");
    }
  };
  const timer = setTimeout(() => {
    interrupt("timeout");
  }, options.timeoutMs);
  const abortListener = () => interrupt("abort");
  options.signal.addEventListener("abort", abortListener, { once: true });

  try {
    const [stdout, stderr] = await Promise.all([chunks.stdout, chunks.stderr]);
    const [exitCode] = (await once(child, "close")) as [number | null];
    return {
      stdout,
      stderr,
      exitCode,
      interrupted: interrupted || options.signal.aborted,
      ...((interrupted || options.signal.aborted) ? { interruptedReason: interruptedReason ?? "abort" } : {}),
    };
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", abortListener);
  }
}

async function readWebStream(
  stream?: ReadableStream<Uint8Array>,
  onText?: (text: string) => void | Promise<void>,
): Promise<string> {
  if (!stream) {
    return "";
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const decoded = decoder.decode(value, { stream: true });
    text += decoded;
    await onText?.(decoded);
  }
  const tail = decoder.decode();
  if (tail) {
    text += tail;
    await onText?.(tail);
  }
  return text;
}

async function readNodeStream(
  stream: Readable | null,
  onText?: (text: string) => void | Promise<void>,
): Promise<string> {
  if (!stream) {
    return "";
  }
  let text = "";
  for await (const chunk of stream) {
    const decoded = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    text += decoded;
    await onText?.(decoded);
  }
  return text;
}
