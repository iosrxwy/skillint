import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { asBoolean, asString, estimateTokens, parseFrontmatter } from "./frontmatter.js";
import type { Kind, ScanResult, SkillFile, Source } from "./types.js";

const SKILL_NAMES = new Set(["skill.md"]);
const RULE_NAMES = new Set([
  "agents.md",
  "claude.md",
  "gemini.md",
  ".cursorrules",
  "copilot-instructions.md",
]);

export interface DiscoverOptions {
  cwd?: string;
  home?: string;
  extraRoots?: string[];
  project?: boolean;
  global?: boolean;
}

function homeRoots(home: string): Array<{ root: string; source: Source }> {
  return [
    { root: join(home, ".cursor", "skills"), source: "cursor-global" },
    { root: join(home, ".claude", "skills"), source: "claude-global" },
    { root: join(home, ".codex", "skills"), source: "codex-global" },
    { root: join(home, ".agents", "skills"), source: "agents-global" },
  ];
}

function projectRoots(cwd: string): Array<{ root: string; source: Source }> {
  return [
    { root: join(cwd, ".cursor", "skills"), source: "cursor-project" },
    { root: join(cwd, ".cursor", "rules"), source: "cursor-project" },
    { root: join(cwd, ".claude", "skills"), source: "claude-project" },
    { root: join(cwd, ".codex", "skills"), source: "codex-project" },
    { root: join(cwd, ".agents", "skills"), source: "agents-project" },
    { root: join(cwd, "skills"), source: "project-root" },
    { root: cwd, source: "project-root" },
  ];
}

function classify(filePath: string, root: string, source: Source): Kind | null {
  const name = basename(filePath).toLowerCase();
  if (SKILL_NAMES.has(name)) return "skill";
  if (name.endsWith(".mdc")) return "rule";
  if (RULE_NAMES.has(name)) {
    if (source === "project-root") {
      const rel = relative(root, filePath);
      if (rel.includes(sep) && name !== "copilot-instructions.md") return null;
    }
    return "rule";
  }
  return null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".next", "vendor"]);

async function walkFiles(root: string, source: Source, cwd: string): Promise<string[]> {
  const info = await stat(root).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [root];

  if (source === "project-root" && resolve(root) === resolve(cwd)) {
    const files: string[] = [];
    for (const name of ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules"]) {
      const candidate = join(root, name);
      if (await exists(candidate)) files.push(candidate);
    }
    const copilot = join(root, ".github", "copilot-instructions.md");
    if (await exists(copilot)) files.push(copilot);
    return files;
  }

  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }

  await walk(root);
  return out;
}

function folderName(filePath: string): string {
  return basename(dirname(filePath));
}

function inferName(filePath: string, kind: Kind, data: Record<string, unknown>): string {
  const named = asString(data.name);
  if (named) return named;
  if (kind === "skill") return folderName(filePath);
  return basename(filePath).replace(/\.(mdc|md)$/i, "");
}

async function toSkillFile(
  filePath: string,
  kind: Kind,
  source: Source,
): Promise<SkillFile> {
  const raw = await readFile(filePath, "utf8");
  const info = await stat(filePath);
  const { data, body } = parseFrontmatter(raw);
  const name = inferName(filePath, kind, data);
  const description = asString(data.description);
  const alwaysApply = asBoolean(data.alwaysApply) || asBoolean(data["always-apply"]);
  const metaText = `${name}\n${description}`;

  return {
    path: filePath,
    kind,
    source,
    name,
    description,
    alwaysApply,
    bytes: info.size,
    mtimeMs: info.mtimeMs,
    bodyChars: body.trim().length,
    metaTokens: estimateTokens(metaText),
    bodyTokens: estimateTokens(body),
  };
}

export async function discover(options: DiscoverOptions = {}): Promise<ScanResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const home = options.home ?? homedir();
  const project = options.project !== false;
  const global = options.global !== false;

  const candidates: Array<{ root: string; source: Source }> = [];
  if (global) candidates.push(...homeRoots(home));
  if (project) candidates.push(...projectRoots(cwd));
  for (const extra of options.extraRoots ?? []) {
    candidates.push({ root: resolve(extra), source: "custom" });
  }

  const seenRoots = new Set<string>();
  const roots: string[] = [];
  const files: SkillFile[] = [];
  const seenFiles = new Set<string>();

  for (const { root, source } of candidates) {
    if (seenRoots.has(root)) continue;
    seenRoots.add(root);
    if (!(await exists(root))) continue;
    roots.push(root);

    const paths = await walkFiles(root, source, cwd);
    for (const filePath of paths) {
      if (seenFiles.has(filePath)) continue;
      const kind = classify(filePath, root, source);
      if (!kind) continue;
      seenFiles.add(filePath);
      files.push(await toSkillFile(filePath, kind, source));
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, roots };
}
