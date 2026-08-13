import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { asBoolean, asString, estimateTokens, parseFrontmatter } from "./frontmatter.js";
import { isIgnored } from "./ignore.js";
import type { Kind, ScanResult, SkillFile, Source } from "./types.js";

const SKILL_NAMES = new Set(["skill.md"]);
const RULE_NAMES = new Set([
  "agents.md",
  "agent.md",
  "claude.md",
  "claude.local.md",
  "gemini.md",
  "grok.md",
  "codex.md",
  "copilot.md",
  "windsurf.md",
  "opencode.md",
  "kiro.md",
  ".cursorrules",
  ".windsurfrules",
  ".clinerules",
  "copilot-instructions.md",
]);
const RULE_FOLDERS = new Set(["rules", "prompts", "steering", "commands", "instructions"]);

const GLOBAL_DIRS: Array<{ dir: string; source: Source }> = [
  { dir: ".cursor/skills", source: "cursor-global" },
  { dir: ".cursor/rules", source: "cursor-global" },
  { dir: ".claude/skills", source: "claude-global" },
  { dir: ".claude/rules", source: "claude-global" },
  { dir: ".codex/skills", source: "codex-global" },
  { dir: ".codex/rules", source: "codex-global" },
  { dir: ".codex/prompts", source: "codex-global" },
  { dir: ".agents/skills", source: "agents-global" },
  { dir: ".agents/commands", source: "agents-global" },
  { dir: ".grok/skills", source: "grok-global" },
  { dir: ".grok/plugins", source: "grok-global" },
  { dir: ".gemini/skills", source: "gemini-global" },
  { dir: ".copilot/skills", source: "copilot-global" },
  { dir: ".config/opencode/skills", source: "opencode-global" },
  { dir: ".config/opencode/skill", source: "opencode-global" },
  { dir: ".codeium/windsurf/skills", source: "windsurf-global" },
  { dir: ".windsurf/skills", source: "windsurf-global" },
  { dir: ".kiro/skills", source: "kiro-global" },
  { dir: ".kiro/steering", source: "kiro-global" },
  { dir: ".cline/skills", source: "cline-global" },
  { dir: ".continue/skills", source: "continue-global" },
  { dir: ".antigravity/skills", source: "antigravity-global" },
  { dir: ".factory/skills", source: "factory-global" },
  { dir: ".openclaw/skills", source: "openclaw-global" },
  { dir: ".hermes/skills", source: "hermes-global" },
  { dir: ".qoder/skills", source: "qoder-global" },
  { dir: ".codebuddy/skills", source: "codebuddy-global" },
  { dir: ".commandcode/skills", source: "commandcode-global" },
  { dir: ".workbuddy/skills", source: "workbuddy-global" },
  { dir: ".cc-switch/skills", source: "cc-switch-global" },
  { dir: ".amp/skills", source: "amp-global" },
  { dir: ".goose/skills", source: "goose-global" },
  { dir: ".config/goose/skills", source: "goose-global" },
  { dir: ".crush/skills", source: "crush-global" },
  { dir: ".trae/skills", source: "trae-global" },
  { dir: ".roo/skills", source: "roo-global" },
  { dir: ".pi/skills", source: "pi-global" },
];

const PROJECT_DIRS: Array<{ dir: string; source: Source }> = [
  { dir: ".cursor/skills", source: "cursor-project" },
  { dir: ".cursor/rules", source: "cursor-project" },
  { dir: ".claude/skills", source: "claude-project" },
  { dir: ".claude/rules", source: "claude-project" },
  { dir: ".codex/skills", source: "codex-project" },
  { dir: ".codex/rules", source: "codex-project" },
  { dir: ".codex/prompts", source: "codex-project" },
  { dir: ".agents/skills", source: "agents-project" },
  { dir: ".agents/commands", source: "agents-project" },
  { dir: ".grok/skills", source: "grok-project" },
  { dir: ".grok/plugins", source: "grok-project" },
  { dir: ".gemini/skills", source: "gemini-project" },
  { dir: ".github/skills", source: "copilot-project" },
  { dir: ".github/agents", source: "copilot-project" },
  { dir: ".github/instructions", source: "copilot-project" },
  { dir: ".github/prompts", source: "copilot-project" },
  { dir: ".opencode/skills", source: "opencode-project" },
  { dir: ".opencode/skill", source: "opencode-project" },
  { dir: ".windsurf/skills", source: "windsurf-project" },
  { dir: ".windsurf/rules", source: "windsurf-project" },
  { dir: ".kiro/skills", source: "kiro-project" },
  { dir: ".kiro/steering", source: "kiro-project" },
  { dir: ".cline/skills", source: "cline-project" },
  { dir: ".continue/skills", source: "continue-project" },
  { dir: ".antigravity/skills", source: "antigravity-project" },
  { dir: ".factory/skills", source: "factory-project" },
  { dir: ".openclaw/skills", source: "openclaw-project" },
  { dir: ".hermes/skills", source: "hermes-project" },
  { dir: ".qoder/skills", source: "qoder-project" },
  { dir: ".codebuddy/skills", source: "codebuddy-project" },
  { dir: ".commandcode/skills", source: "commandcode-project" },
  { dir: ".workbuddy/skills", source: "workbuddy-project" },
  { dir: ".amp/skills", source: "amp-project" },
  { dir: ".goose/skills", source: "goose-project" },
  { dir: ".crush/skills", source: "crush-project" },
  { dir: ".trae/skills", source: "trae-project" },
  { dir: ".roo/skills", source: "roo-project" },
  { dir: ".pi/skills", source: "pi-project" },
  { dir: "skills", source: "project-root" },
];

const ROOT_RULE_FILES = [
  "AGENTS.md",
  "Agents.md",
  "AGENT.md",
  "CLAUDE.md",
  "CLAUDE.local.md",
  "GEMINI.md",
  "GROK.md",
  "CODEX.md",
  "COPILOT.md",
  "WINDSURF.md",
  "OPENCODE.md",
  "KIRO.md",
  ".cursorrules",
  ".windsurfrules",
  ".clinerules",
];

export interface DiscoverOptions {
  cwd?: string;
  home?: string;
  extraRoots?: string[];
  project?: boolean;
  global?: boolean;
  ignore?: string[];
}

function homeRoots(home: string): Array<{ root: string; source: Source }> {
  return GLOBAL_DIRS.map((item) => ({ root: join(home, item.dir), source: item.source }));
}

function projectRoots(cwd: string): Array<{ root: string; source: Source }> {
  return [
    ...PROJECT_DIRS.map((item) => ({ root: join(cwd, item.dir), source: item.source })),
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
  if (name.endsWith(".md")) {
    const parent = basename(dirname(filePath)).toLowerCase();
    const grand = basename(dirname(dirname(filePath))).toLowerCase();
    if (RULE_FOLDERS.has(parent) || RULE_FOLDERS.has(grand)) return "rule";
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
const MAX_READ_BYTES = 512 * 1024;
const READ_CONCURRENCY = 32;

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

function hashBody(text: string): string {
  if (!text) return "";
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function walkFiles(root: string, source: Source, cwd: string): Promise<string[]> {
  const info = await stat(root).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [root];

  if (source === "project-root" && resolve(root) === resolve(cwd)) {
    const files: string[] = [];
    for (const name of ROOT_RULE_FILES) {
      const candidate = join(root, name);
      if (await exists(candidate)) files.push(candidate);
    }
    for (const nested of [
      join(root, ".github", "copilot-instructions.md"),
      join(root, ".vscode", "copilot-instructions.md"),
    ]) {
      if (await exists(nested)) files.push(nested);
    }
    return files;
  }

  const out: string[] = [];
  const seenReal = new Set<string>();

  async function walk(dir: string): Promise<void> {
    const real = await realpath(dir).catch(() => dir);
    if (seenReal.has(real)) return;
    seenReal.add(real);

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await stat(full).catch(() => null);
        if (!target) continue;
        if (target.isDirectory()) await walk(full);
        else if (target.isFile()) out.push(full);
        continue;
      }
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(full);
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

async function readSkillText(filePath: string, size: number): Promise<{ raw: string; truncated: boolean }> {
  if (size <= MAX_READ_BYTES) {
    return { raw: await readFile(filePath, "utf8"), truncated: false };
  }
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(MAX_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MAX_READ_BYTES, 0);
    return { raw: buffer.subarray(0, bytesRead).toString("utf8"), truncated: true };
  } finally {
    await handle.close();
  }
}

async function toSkillFile(
  filePath: string,
  kind: Kind,
  source: Source,
): Promise<SkillFile> {
  const info = await stat(filePath);
  const { raw, truncated } = await readSkillText(filePath, info.size);
  const { data, body } = parseFrontmatter(raw);
  const name = inferName(filePath, kind, data);
  const description = asString(data.description);
  const alwaysApply = asBoolean(data.alwaysApply) || asBoolean(data["always-apply"]);
  const metaText = `${name}\n${description}`;
  const trimmedBody = body.trim();
  const estimatedFromSize = Math.ceil(info.size / 4);

  return {
    path: filePath,
    kind,
    source,
    name,
    description,
    alwaysApply,
    bytes: info.size,
    mtimeMs: info.mtimeMs,
    bodyChars: truncated ? info.size : trimmedBody.length,
    bodyLines: raw.split(/\r?\n/).length,
    metaTokens: estimateTokens(metaText),
    bodyTokens: truncated ? Math.max(estimateTokens(body), estimatedFromSize) : estimateTokens(body),
    bodyHash: hashBody(trimmedBody),
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

  const ignore = options.ignore ?? [];
  const seenRoots = new Set<string>();
  const unique: Array<{ root: string; source: Source }> = [];
  for (const candidate of candidates) {
    if (seenRoots.has(candidate.root)) continue;
    seenRoots.add(candidate.root);
    unique.push(candidate);
  }

  const live = (
    await Promise.all(
      unique.map(async (candidate) => ({
        ...candidate,
        ok: await exists(candidate.root),
      })),
    )
  ).filter((candidate) => candidate.ok);

  const found: Array<{ filePath: string; kind: Kind; source: Source }> = [];
  await Promise.all(
    live.map(async ({ root, source }) => {
      const paths = await walkFiles(root, source, cwd);
      for (const filePath of paths) {
        if (isIgnored(filePath, ignore)) continue;
        const kind = classify(filePath, root, source);
        if (!kind) continue;
        found.push({ filePath, kind, source });
      }
    }),
  );

  const seenFiles = new Set<string>();
  const pending: Array<{ filePath: string; kind: Kind; source: Source }> = [];
  for (const item of found) {
    if (seenFiles.has(item.filePath)) continue;
    seenFiles.add(item.filePath);
    pending.push(item);
  }

  const files = await mapPool(pending, READ_CONCURRENCY, (item) =>
    toSkillFile(item.filePath, item.kind, item.source),
  );
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, roots: live.map((item) => item.root).sort((a, b) => a.localeCompare(b)) };
}
