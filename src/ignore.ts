import { basename } from "node:path";
import { readFile } from "node:fs/promises";

export function parseIgnore(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export async function loadIgnoreFile(path: string): Promise<string[]> {
  try {
    return parseIgnore(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

export function isIgnored(filePath: string, patterns: string[]): boolean {
  if (!patterns.length) return false;
  const normalized = filePath.replace(/\\/g, "/");
  const base = basename(normalized);

  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      const re = globToRegExp(pattern);
      if (re.test(normalized) || re.test(base)) return true;
      continue;
    }
    if (base === pattern || normalized.endsWith(`/${pattern}`) || normalized.includes(`/${pattern}/`)) {
      return true;
    }
  }
  return false;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/\\/g, "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ":::GLOBSTAR:::")
    .replace(/\*/g, "[^/]*")
    .replace(/:::GLOBSTAR:::/g, ".*");
  return new RegExp(`(^|/)${escaped}$`);
}
