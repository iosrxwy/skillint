import type { PrunePlan, SkillFile } from "./types.js";

function score(file: SkillFile): number {
  let value = 0;
  if (file.description) value += 50;
  if (file.kind === "skill") value += 10;
  if (file.bodyChars > 0) value += 10;
  if (file.bodyTokens < 1500) value += 15;
  else if (file.bodyTokens > 4000) value -= 20;
  value += Math.min(10, Math.floor(file.mtimeMs / 1e12));
  return value;
}

export function planPrune(files: SkillFile[], keep: number): PrunePlan {
  const unique = new Map<string, SkillFile>();
  const drop: PrunePlan["drop"] = [];

  const ranked = [...files].sort((a, b) => score(b) - score(a) || a.path.localeCompare(b.path));

  for (const file of ranked) {
    const key = `${file.kind}:${file.name.toLowerCase()}`;
    const existing = unique.get(key);
    if (existing) {
      drop.push({ file, reason: `duplicate of ${existing.path}` });
      continue;
    }
    unique.set(key, file);
  }

  const winners = [...unique.values()].sort(
    (a, b) => score(b) - score(a) || a.path.localeCompare(b.path),
  );

  const kept = winners.slice(0, Math.max(0, keep));
  const keptSet = new Set(kept.map((file) => file.path));

  for (const file of winners.slice(keep)) {
    drop.push({
      file,
      reason: `outside --keep ${keep} (lower score than the retained set)`,
    });
  }

  const keepFiles = files.filter((file) => keptSet.has(file.path));
  return { keep: keepFiles, drop };
}
