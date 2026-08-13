import { execFile } from "node:child_process";
import { lstat, readFile, realpath, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { sourceFamily } from "./doctor.js";
import { deleteTarget, isBackup } from "./prune.js";
import { quarantine } from "./trash.js";
import type { LinkAction, LinkPlan, SkillFile, UpdateCheck } from "./types.js";

const execFileAsync = promisify(execFile);

const FAMILY_RANK: Record<string, number> = {
  agents: 0,
  cursor: 1,
  claude: 2,
  codex: 3,
  grok: 4,
  gemini: 5,
  copilot: 6,
};

function familyRank(family: string): number {
  return FAMILY_RANK[family] ?? 50;
}

function canonicalOf(files: SkillFile[]): SkillFile {
  return [...files].sort((a, b) => {
    const family = familyRank(sourceFamily(a.source)) - familyRank(sourceFamily(b.source));
    if (family !== 0) return family;
    return a.path.localeCompare(b.path);
  })[0];
}

export function planLink(files: SkillFile[]): LinkPlan {
  const byName = new Map<string, SkillFile[]>();
  for (const file of files) {
    if (file.kind !== "skill" || isBackup(file)) continue;
    const list = byName.get(file.name.toLowerCase()) ?? [];
    list.push(file);
    byName.set(file.name.toLowerCase(), list);
  }

  const actions: LinkAction[] = [];
  for (const [name, group] of byName) {
    const byFamily = new Map<string, SkillFile[]>();
    for (const file of group) {
      const family = sourceFamily(file.source);
      const list = byFamily.get(family) ?? [];
      list.push(file);
      byFamily.set(family, list);
    }
    if (byFamily.size < 2) continue;

    const winners = [...byFamily.values()].map((copies) =>
      [...copies].sort((a, b) => a.path.localeCompare(b.path))[0],
    );
    const canonical = canonicalOf(winners);
    const canonicalDir = deleteTarget(canonical);
    const canonicalFamily = sourceFamily(canonical.source);

    for (const file of winners) {
      if (file.path === canonical.path) continue;
      const sameBody = Boolean(file.bodyHash) && file.bodyHash === canonical.bodyHash;
      actions.push({
        name,
        canonicalPath: canonicalDir,
        canonicalFamily,
        linkPath: deleteTarget(file),
        linkFamily: sourceFamily(file.source),
        status: sameBody ? "link" : "conflict",
        reason: sameBody
          ? `Identical copy; replace with a symlink to the ${canonicalFamily} catalog`
          : `Same name as ${canonicalFamily}, but the body differs — not linked`,
      });
    }
  }

  actions.sort((a, b) => a.name.localeCompare(b.name) || a.linkPath.localeCompare(b.linkPath));
  return { actions };
}

export async function resolveLinkPlan(files: SkillFile[]): Promise<LinkPlan> {
  const plan = planLink(files);
  for (const action of plan.actions) {
    if (action.status !== "link") continue;
    const info = await lstat(action.linkPath).catch(() => null);
    if (!info?.isSymbolicLink()) continue;
    const [linkReal, canonicalReal] = await Promise.all([
      realpath(action.linkPath).catch(() => ""),
      realpath(action.canonicalPath).catch(() => ""),
    ]);
    if (linkReal && canonicalReal && linkReal === canonicalReal) {
      action.status = "already-linked";
      action.reason = `Already linked to ${action.canonicalPath}`;
    }
  }
  return plan;
}

export async function applyLinkPlan(
  plan: LinkPlan,
  options: { home?: string } = {},
): Promise<{ linked: number; skipped: number; batchDir?: string }> {
  let linked = 0;
  let skipped = 0;
  const actionable: Array<{ action: LinkAction; canonicalReal: string }> = [];
  for (const action of plan.actions) {
    if (action.status === "already-linked" || action.status === "conflict") {
      skipped += 1;
      continue;
    }
    const canonicalReal = await realpath(action.canonicalPath);
    const info = await lstat(action.linkPath).catch(() => null);
    if (info?.isSymbolicLink()) {
      const current = await realpath(action.linkPath).catch(() => "");
      if (current === canonicalReal) {
        skipped += 1;
        continue;
      }
    }
    actionable.push({ action, canonicalReal });
  }
  if (actionable.length === 0) return { linked, skipped };

  const { batchDir, items } = await quarantine(
    actionable.map((entry) => entry.action.linkPath),
    { home: options.home },
  );
  const moved = new Set(items.map((item) => item.from));
  for (const { action, canonicalReal } of actionable) {
    if (!moved.has(action.linkPath)) {
      skipped += 1;
      continue;
    }
    await symlink(canonicalReal, action.linkPath);
    linked += 1;
  }
  return { linked, skipped, batchDir };
}

async function git(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" });
    return { ok: true, stdout: stdout.trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
}

async function loadLockfileText(home: string, cwd: string): Promise<string> {
  const candidates = [
    join(home, ".agents", ".skill-lock.json"),
    join(home, ".agents", "skills-lock.json"),
    join(cwd, ".agents", "skills-lock.json"),
  ];
  const parts = await Promise.all(candidates.map((path) => readFile(path, "utf8").catch(() => "")));
  return parts.join("\n");
}

export interface CheckUpdatesOptions {
  home?: string;
  cwd?: string;
}

export async function checkUpdates(files: SkillFile[], options: CheckUpdatesOptions = {}): Promise<UpdateCheck[]> {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const lockfileText = await loadLockfileText(home, cwd);
  const seen = new Set<string>();
  const checks: UpdateCheck[] = [];
  for (const file of files) {
    if (file.kind !== "skill") continue;
    const path = deleteTarget(file);
    const canonical = await realpath(path).catch(() => path);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const toplevel = await git(path, ["rev-parse", "--show-toplevel"]);
    if (!toplevel.ok || resolve(toplevel.stdout) !== resolve(canonical)) {
      if (lockfileText.includes(`"${file.name}"`)) {
        checks.push({
          name: file.name,
          path,
          status: "lockfile",
          hint: `npx skills update ${file.name}`,
        });
        continue;
      }
      checks.push({ name: file.name, path, status: "not-git" });
      continue;
    }
    const remote = await git(path, ["remote", "get-url", "origin"]);
    if (!remote.ok || !remote.stdout) {
      checks.push({ name: file.name, path, status: "no-remote" });
      continue;
    }
    const dirty = await git(path, ["status", "--porcelain"]);
    if (dirty.ok && dirty.stdout) {
      checks.push({ name: file.name, path, status: "dirty", remote: remote.stdout });
      continue;
    }
    const behind = await git(path, ["rev-list", "--count", "HEAD..@{u}"]);
    const ahead = await git(path, ["rev-list", "--count", "@{u}..HEAD"]);
    if (!behind.ok || !ahead.ok) {
      checks.push({ name: file.name, path, status: "no-remote", remote: remote.stdout });
      continue;
    }
    const behindCount = Number(behind.stdout || "0");
    const aheadCount = Number(ahead.stdout || "0");
    const status = behindCount > 0 ? "behind" : aheadCount > 0 ? "ahead" : "up-to-date";
    checks.push({ name: file.name, path, status, remote: remote.stdout });
  }
  return checks.sort((a, b) => a.path.localeCompare(b.path));
}

export async function applyUpdates(checks: UpdateCheck[]): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;
  for (const item of checks) {
    if (item.status !== "behind") {
      skipped += 1;
      continue;
    }
    const pulled = await git(item.path, ["pull", "--ff-only"]);
    if (pulled.ok) updated += 1;
    else skipped += 1;
  }
  return { updated, skipped };
}
