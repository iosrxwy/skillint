import { parse as parseYaml } from "yaml";

const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FRONTMATTER_START_RE = /^\uFEFF?---\r?\n/;

export interface FrontmatterResult {
  data: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
  error: string;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function parseFrontmatter(text: string): FrontmatterResult {
  const match = text.match(FRONTMATTER_RE);
  if (!match) {
    return {
      data: {},
      body: text,
      hasFrontmatter: FRONTMATTER_START_RE.test(text),
      error: FRONTMATTER_START_RE.test(text) ? "Frontmatter is missing its closing --- marker" : "",
    };
  }

  let data: Record<string, unknown> = {};
  let error = "";
  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    } else if (parsed != null) {
      error = "Frontmatter must be a YAML object";
    }
  } catch (caught) {
    data = {};
    error = caught instanceof Error ? caught.message.split("\n")[0] : String(caught);
  }

  return {
    data,
    body: text.slice(match[0].length),
    hasFrontmatter: true,
    error,
  };
}

export function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

export function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}
