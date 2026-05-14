import { access } from "node:fs/promises";
import path from "node:path";

import { describeSettingsPaths, loadModelConfig } from "../config/index.js";
import { getDefaultModelConfigPath } from "../config/model-config.js";
import type { CliOptions } from "./main.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  details: string;
  hint?: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
}

export async function runDoctor(options: CliOptions): Promise<DoctorReport> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const configPath = resolveConfigPath(options);
  const settingsPaths = await describeSettingsPaths({
    cwd,
    ...(env.KAI_HOME ? { homeDir: env.KAI_HOME } : env.HOME ? { homeDir: env.HOME } : {}),
  });
  const config = await loadModelConfig({ configPath });
  const checks: DoctorCheck[] = [
    config.status === "ok"
      ? {
          name: "model config",
          ok: true,
          details: `${config.configPath} (${config.profile.provider}/${config.profile.model})`,
        }
      : {
          name: "model config",
          ok: false,
          details: config.status === "missing"
            ? `missing: ${config.configPath}`
            : `invalid: ${config.configPath}`,
          hint: "Run `kai init` to create a model config.",
        },
    {
      name: "ripgrep",
      ok: await hasExecutable("rg", env.PATH),
      details: await hasExecutable("rg", env.PATH) ? "available on PATH" : "missing from PATH",
      hint: "Install ripgrep so grep-based tools can work efficiently.",
    },
    {
      name: "settings",
      ok: true,
      details: settingsPaths.map((entry) => `${entry.scope}:${entry.exists ? "present" : "missing"}`).join(", "),
    },
    {
      name: "workspace",
      ok: await pathExists(cwd),
      details: cwd,
    },
    {
      name: "node",
      ok: true,
      details: process.version,
    },
  ];

  return { checks };
}

export function formatDoctorReport(report: DoctorReport): string {
  return [
    "Kai doctor",
    ...report.checks.map((check) => {
      const status = check.ok ? "OK" : "MISSING";
      const hint = check.hint ? `\n  hint: ${check.hint}` : "";
      return `${check.name}: ${status}\n  ${check.details}${hint}`;
    }),
  ].join("\n");
}

async function hasExecutable(name: string, pathEnv: string | undefined): Promise<boolean> {
  const pathEntries = (pathEnv ?? "").split(path.delimiter).filter(Boolean);
  const candidates = pathEntries.flatMap((entry) => [path.join(entry, name), path.join(entry, `${name}.cmd`), path.join(entry, `${name}.exe`)]);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function resolveConfigPath(options: CliOptions): string | undefined {
  if (options.configPath) {
    return options.configPath;
  }
  const env = options.env ?? process.env;
  if (env.KAI_CONFIG_PATH) {
    return env.KAI_CONFIG_PATH;
  }
  const homeDir = env.KAI_HOME ?? env.HOME;
  if (homeDir) {
    return getDefaultModelConfigPath({ homeDir });
  }
  return process.env.KAI_CONFIG_PATH;
}
