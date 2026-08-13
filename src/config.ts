import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DoctorLimits } from "./doctor.js";

export const CONFIG_FILE = "skillint.config.json";

export interface SkillintConfig {
  ignore?: string[];
  limits?: Partial<DoctorLimits>;
}

const LIMIT_KEYS: Array<keyof DoctorLimits> = [
  "skillBodyTokens",
  "ruleAlwaysOnTokens",
  "descriptionMax",
  "descriptionMin",
  "agentsDocLines",
  "nameMax",
];

export async function loadConfig(cwd: string): Promise<SkillintConfig> {
  let text: string;
  try {
    text = await readFile(join(cwd, CONFIG_FILE), "utf8");
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid ${CONFIG_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid ${CONFIG_FILE}: expected a JSON object`);
  }

  const raw = parsed as Record<string, unknown>;
  const config: SkillintConfig = {};

  if (raw.ignore !== undefined) {
    if (!Array.isArray(raw.ignore) || raw.ignore.some((item) => typeof item !== "string")) {
      throw new Error(`Invalid ${CONFIG_FILE}: "ignore" must be an array of strings`);
    }
    config.ignore = raw.ignore as string[];
  }

  if (raw.limits !== undefined) {
    if (typeof raw.limits !== "object" || raw.limits === null || Array.isArray(raw.limits)) {
      throw new Error(`Invalid ${CONFIG_FILE}: "limits" must be an object`);
    }
    const limits: Partial<DoctorLimits> = {};
    for (const key of LIMIT_KEYS) {
      const value = (raw.limits as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid ${CONFIG_FILE}: "limits.${key}" must be a positive number`);
      }
      limits[key] = value;
    }
    config.limits = limits;
  }

  return config;
}
