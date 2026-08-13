import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { asString, hasSloppyFrontmatterDelimiter, parseFrontmatter } from "./frontmatter.js";
import { SKILL_NAME_MAX, SKILL_NAME_RE } from "./init.js";
import { quarantine } from "./trash.js";
import type { SkillFile } from "./types.js";

export interface FixPlanItem {
  path: string;
  problems: string[];
  name: string;
  description: string;
  newContent: string;
}

export function sanitizeName(folder: string): string {
  const name = folder
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SKILL_NAME_MAX)
    .replace(/^-+|-+$/g, "");
  return SKILL_NAME_RE.test(name) ? name : "unnamed-skill";
}

export function draftDescription(body: string): string {
  const lines = body.split(/\r?\n/);
  const paragraph: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!trimmed) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed) || /^[-*>|]/.test(trimmed) || /^\d+\./.test(trimmed)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(trimmed);
  }
  const text = paragraph
    .join(" ")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length >= 20) {
    const chars = [...text];
    return chars.length > 180 ? `${chars.slice(0, 179).join("")}…` : text;
  }
  return "Describe when an agent should load this skill and what it does.";
}

interface RecoveredHeader {
  data: Record<string, unknown>;
  body: string;
}

export function recoverBareHeader(raw: string): RecoveredHeader | null {
  const lines = raw.split(/\r?\n/);
  const header: string[] = [];
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) break;
    if (!/^[A-Za-z_][\w-]*:\s/.test(line) && !/^\s+/.test(line)) break;
    header.push(line);
  }
  if (header.length === 0) return null;
  const text = header.join("\n");
  if (!/^name:\s/m.test(text) && !/^description:\s/m.test(text)) return null;
  try {
    const parsed = parseYaml(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const data = parsed as Record<string, unknown>;
    if (!asString(data.name) && !asString(data.description)) return null;
    return { data, body: lines.slice(index).join("\n").replace(/^\s*\n/, "") };
  } catch {
    return null;
  }
}

export async function planFix(files: SkillFile[]): Promise<FixPlanItem[]> {
  const items: FixPlanItem[] = [];
  for (const file of files) {
    if (file.kind !== "skill") continue;
    if (file.frontmatterError) continue;
    const missingFrontmatter = file.hasFrontmatter === false;
    const missingName = !missingFrontmatter && file.hasDeclaredName === false;
    const missingDescription = !missingFrontmatter && !file.description;

    let raw: string;
    try {
      raw = await readFile(file.path, "utf8");
    } catch {
      continue;
    }
    const sloppy = hasSloppyFrontmatterDelimiter(raw);
    if (!missingFrontmatter && !missingName && !missingDescription && !sloppy) continue;

    const parsed = parseFrontmatter(raw);
    const folderName = sanitizeName(basename(dirname(file.path)));
    const problems: string[] = [];
    if (sloppy) problems.push("sloppy-delimiter");

    let data: Record<string, unknown>;
    let body: string;
    if (missingFrontmatter) {
      const recovered = recoverBareHeader(raw);
      if (recovered) {
        problems.push("bare-frontmatter");
        data = recovered.data;
        body = recovered.body;
      } else {
        problems.push("missing-frontmatter");
        data = {};
        body = raw;
      }
    } else {
      data = { ...parsed.data };
      body = parsed.body;
      if (missingName) problems.push("missing-name");
      if (missingDescription) problems.push("missing-description");
    }

    const name = asString(data.name) || folderName;
    const description = asString(data.description) || draftDescription(body);
    const ordered: Record<string, unknown> = { ...data, name, description };

    const frontmatter = stringifyYaml(ordered).trimEnd();
    const trimmedBody = body.replace(/^\s*\n/, "");
    const newContent = `---\n${frontmatter}\n---\n\n${trimmedBody.trimEnd()}\n`;
    items.push({ path: file.path, problems, name, description, newContent });
  }
  return items.sort((a, b) => a.path.localeCompare(b.path));
}

export async function applyFix(
  items: FixPlanItem[],
  options: { home?: string } = {},
): Promise<{ fixed: number; batchDir?: string }> {
  if (items.length === 0) return { fixed: 0 };
  const { batchDir, items: moved } = await quarantine(
    items.map((item) => item.path),
    { home: options.home },
  );
  const movedSet = new Set(moved.map((entry) => entry.from));
  let fixed = 0;
  for (const item of items) {
    if (!movedSet.has(item.path)) continue;
    await writeFile(item.path, item.newContent, "utf8");
    fixed += 1;
  }
  return { fixed, batchDir };
}
