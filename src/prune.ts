import { basename, dirname } from "node:path";
import { DEFAULT_LIMITS, sourceFamily } from "./doctor.js";
import type { PruneConfidence, PruneDrop, PrunePlan, PruneReason, SkillFile } from "./types.js";

function depth(path: string): number {
  return path.split(/[/\\]/).filter(Boolean).length;
}

export function isBackup(file: SkillFile): boolean {
  const folder = basename(dirname(file.path)).toLowerCase();
  const normalized = file.path.replace(/\\/g, "/").toLowerCase();
  return (
    folder.includes(".bak") ||
    /(?:^|[._-])bak(?:[._-]|$)/.test(folder) ||
    folder.endsWith(".old") ||
    folder.endsWith(".orig") ||
    /\/(backup|backups)\//.test(normalized)
  );
}

export function collapseDeletePaths(paths: string[]): string[] {
  const unique = [...new Set(paths)].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const kept: string[] = [];
  for (const path of unique) {
    if (kept.some((parent) => path.startsWith(`${parent}/`) || path.startsWith(`${parent}\\`))) continue;
    kept.push(path);
  }
  return kept;
}

export function deleteTarget(file: SkillFile): string {
  if (file.kind === "skill" && basename(file.path).toLowerCase() === "skill.md") {
    return dirname(file.path);
  }
  return file.path;
}

function score(file: SkillFile): number {
  let value = 0;
  if (file.description) value += 50;
  if (file.kind === "skill") value += 10;
  if (file.bodyChars > 0) value += 10;
  if (file.hasFrontmatter !== false && !file.frontmatterError) value += 20;
  if (file.bodyTokens < 1500) value += 15;
  else if (file.bodyTokens > 4000) value -= 20;
  if (isBackup(file)) value -= 1000;
  value -= depth(file.path);
  value += Math.min(10, Math.floor(file.mtimeMs / 1e12));
  return value;
}

function better(a: SkillFile, b: SkillFile): SkillFile {
  const delta = score(a) - score(b);
  if (delta !== 0) return delta > 0 ? a : b;
  return a.path.localeCompare(b.path) <= 0 ? a : b;
}

function dropItem(
  file: SkillFile,
  code: PruneReason,
  confidence: PruneConfidence,
  message: string,
  keepPath?: string,
): PruneDrop {
  return {
    file,
    reason: message,
    code,
    confidence,
    keepPath,
    deletePath: deleteTarget(file),
  };
}

export function planPrune(files: SkillFile[], keep?: number): PrunePlan {
  const dropped = new Map<string, PruneDrop>();

  const take = (item: PruneDrop): void => {
    if (dropped.has(item.file.path)) return;
    dropped.set(item.file.path, item);
  };

  for (const file of files) {
    if (isBackup(file)) {
      take(dropItem(file, "backup", "safe", "Backup or leftover copy; safe to trash", undefined));
    }
  }

  const byFamilyName = new Map<string, SkillFile[]>();
  for (const file of files) {
    const key = `${sourceFamily(file.source)}:${file.kind}:${file.name.toLowerCase()}`;
    const list = byFamilyName.get(key) ?? [];
    list.push(file);
    byFamilyName.set(key, list);
  }

  for (const group of byFamilyName.values()) {
    if (group.length < 2) continue;
    const winner = group.reduce(better);
    for (const file of group) {
      if (file.path === winner.path) continue;
      const nested = depth(file.path) > depth(winner.path);
      take(
        dropItem(
          file,
          isBackup(file) ? "backup" : nested ? "nested-copy" : "duplicate-name",
          "safe",
          nested
            ? `Nested duplicate of ${winner.path}`
            : `Same-catalog duplicate of ${winner.path}`,
          winner.path,
        ),
      );
    }
  }

  const byFamilyHash = new Map<string, SkillFile[]>();
  for (const file of files) {
    if (!file.bodyHash || dropped.has(file.path)) continue;
    const key = `${sourceFamily(file.source)}:${file.bodyHash}`;
    const list = byFamilyHash.get(key) ?? [];
    list.push(file);
    byFamilyHash.set(key, list);
  }
  for (const group of byFamilyHash.values()) {
    const names = new Set(group.map((item) => item.name.toLowerCase()));
    if (group.length < 2 || names.size < 2) continue;
    const winner = group.reduce(better);
    for (const file of group) {
      if (file.path === winner.path) continue;
      take(
        dropItem(
          file,
          "duplicate-content",
          "safe",
          `Same body as ${winner.name} (${winner.path})`,
          winner.path,
        ),
      );
    }
  }

  for (const file of files) {
    if (dropped.has(file.path)) continue;
    if (file.kind === "skill" && (file.hasFrontmatter === false || file.frontmatterError)) {
      take(
        dropItem(
          file,
          "broken-metadata",
          "review",
          file.frontmatterError
            ? `Invalid frontmatter (${file.frontmatterError}); fix or delete`
            : "Missing YAML frontmatter; agents may never load this skill",
        ),
      );
      continue;
    }
    if (file.kind === "skill" && file.bodyTokens > DEFAULT_LIMITS.skillBodyTokens) {
      take(
        dropItem(
          file,
          "oversized",
          "review",
          `Body is ~${file.bodyTokens} tokens; trim it or move it out of the global catalog`,
        ),
      );
    }
  }

  if (keep != null) {
    const remaining = files
      .filter((file) => !dropped.has(file.path))
      .sort((a, b) => score(b) - score(a) || a.path.localeCompare(b.path));
    for (const file of remaining.slice(Math.max(0, keep))) {
      take(
        dropItem(
          file,
          "low-score",
          "review",
          `Outside --keep ${keep} (lower score than the retained set)`,
        ),
      );
    }
  }

  const drop = [...dropped.values()].sort(
    (a, b) =>
      confidenceRank(a.confidence) - confidenceRank(b.confidence) ||
      a.code.localeCompare(b.code) ||
      a.file.path.localeCompare(b.file.path),
  );
  const dropPaths = new Set(drop.map((item) => item.file.path));
  const kept = files.filter((file) => !dropPaths.has(file.path));
  return { keep: kept, drop };
}

function confidenceRank(confidence: PruneConfidence): number {
  if (confidence === "safe") return 0;
  if (confidence === "optional") return 1;
  return 2;
}
