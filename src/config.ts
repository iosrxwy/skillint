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
const ROOT_KEYS = new Set(["$schema", "ignore", "limits"]);

export async function loadConfig(cwd: string): Promise<SkillintConfig> {
  let text: string;
  try {
    text = await readFile(join(cwd, CONFIG_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(
      `Cannot read ${CONFIG_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    );
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
  const unknownRoot = Object.keys(raw).filter((key) => !ROOT_KEYS.has(key));
  if (unknownRoot.length > 0) {
    throw new Error(`Invalid ${CONFIG_FILE}: unknown key "${unknownRoot[0]}"`);
  }

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
    const rawLimits = raw.limits as Record<string, unknown>;
    const unknownLimits = Object.keys(rawLimits).filter(
      (key) => !LIMIT_KEYS.includes(key as keyof DoctorLimits),
    );
    if (unknownLimits.length > 0) {
      throw new Error(`Invalid ${CONFIG_FILE}: unknown limit "${unknownLimits[0]}"`);
    }
    const limits: Partial<DoctorLimits> = {};
    for (const key of LIMIT_KEYS) {
      const value = rawLimits[key];
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`Invalid ${CONFIG_FILE}: "limits.${key}" must be a positive integer`);
      }
      limits[key] = value;
    }
    config.limits = limits;
  }

  return config;
}
