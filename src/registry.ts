import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { parseFrontmatter } from "./frontmatter.js";
import { deleteTarget } from "./prune.js";
import { quarantine } from "./trash.js";
import { walkBounded } from "./walk.js";
import type { SkillFile, UpdateCheck } from "./types.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_REGISTRY_REPOS = [
  "anthropics/skills",
  "vercel-labs/agent-skills",
  "obra/superpowers",
];

export function registryRoot(home = homedir()): string {
  return join(home, ".skillint", "registry");
}

export function sourcesPath(home = homedir()): string {
  return join(home, ".skillint", "sources.json");
}

export interface SourceRecord {
  repo: string;
  skillPath: string;
  matchedBy: "hash";
  adoptedAt: string;
}

export type SourcesMap = Record<string, SourceRecord>;

export async function readSources(home?: string): Promise<SourcesMap> {
  try {
    return JSON.parse(await readFile(sourcesPath(home), "utf8")) as SourcesMap;
  } catch {
    return {};
  }
}

export async function writeSources(sources: SourcesMap, home?: string): Promise<void> {
  await mkdir(dirname(sourcesPath(home)), { recursive: true });
  await writeFile(sourcesPath(home), `${JSON.stringify(sources, null, 2)}\n`, "utf8");
}

async function git(args: string[], cwd?: string): Promise<{ ok: boolean; stdout: string }> {
  try {
    const { stdout } = await execFileAsync("git", cwd ? ["-C", cwd, ...args] : args, {
      encoding: "utf8",
      timeout: 90_000,
    });
    return { ok: true, stdout: stdout.trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
}

export interface RegistrySyncResult {
  synced: string[];
  failed: string[];
}

export async function syncRegistry(
  repos: string[] = DEFAULT_REGISTRY_REPOS,
  options: { home?: string } = {},
): Promise<RegistrySyncResult> {
  const root = registryRoot(options.home);
  await mkdir(root, { recursive: true });
  const synced: string[] = [];
  const failed: string[] = [];
  for (const repo of repos) {
    const dir = join(root, repo.replace(/\//g, "__"));
    const local = repo.startsWith("/") || repo.startsWith("file:");
    const url = local ? repo : `https://github.com/${repo}.git`;
    const pulled = await git(["pull", "--ff-only"], dir);
    if (pulled.ok) {
      synced.push(repo);
      continue;
    }
    const cloned = await git(["clone", "--depth", "1", url, dir]);
    if (cloned.ok) synced.push(repo);
    else failed.push(repo);
  }
  return { synced, failed };
}

export interface RegistrySkill {
  repo: string;
  name: string;
  dir: string;
  bodyHash: string;
}

function hashBody(raw: string): string {
  const { body } = parseFrontmatter(raw);
  const trimmed = body.trim();
  if (!trimmed) return "";
  return createHash("sha256").update(trimmed).digest("hex").slice(0, 16);
}

export async function collectRegistrySkills(
  repos: string[] = DEFAULT_REGISTRY_REPOS,
  options: { home?: string } = {},
): Promise<RegistrySkill[]> {
  const root = registryRoot(options.home);
  const skills: RegistrySkill[] = [];
  for (const repo of repos) {
    const dir = join(root, repo.replace(/\//g, "__"));
    const walked = await walkBounded(dir, { maxDepth: 6 });
    for (const file of walked.files) {
      if (basename(file.logicalPath).toLowerCase() !== "skill.md") continue;
      try {
        const text = await readFile(file.realPath, "utf8");
        skills.push({
          repo,
          name: basename(dirname(file.logicalPath)),
          dir: dirname(file.logicalPath),
          bodyHash: hashBody(text),
        });
      } catch {
        continue;
      }
    }
  }
  return skills;
}

export interface AdoptResult {
  adopted: Array<{ path: string; repo: string; name: string }>;
  nameCandidates: Array<{ path: string; repo: string; name: string }>;
  alreadyAdopted: number;
  orphans: number;
}

export async function adoptSkills(
  files: SkillFile[],
  registry: RegistrySkill[],
  options: { home?: string } = {},
): Promise<AdoptResult> {
  const sources = await readSources(options.home);
  const byHash = new Map<string, RegistrySkill[]>();
  const byName = new Map<string, RegistrySkill[]>();
  for (const skill of registry) {
    const hashList = byHash.get(skill.bodyHash) ?? [];
    hashList.push(skill);
    byHash.set(skill.bodyHash, hashList);
    const nameList = byName.get(skill.name.toLowerCase()) ?? [];
    nameList.push(skill);
    byName.set(skill.name.toLowerCase(), nameList);
  }

  const result: AdoptResult = { adopted: [], nameCandidates: [], alreadyAdopted: 0, orphans: 0 };
  const seen = new Set<string>();
  for (const file of files) {
    if (file.kind !== "skill" || !file.bodyHash) continue;
    const installDir = deleteTarget(file);
    if (seen.has(installDir)) continue;
    seen.add(installDir);
    if (sources[installDir]) {
      result.alreadyAdopted += 1;
      continue;
    }
    const hashMatches = byHash.get(file.bodyHash) ?? [];
    if (hashMatches.length > 0) {
      const match = hashMatches[0];
      sources[installDir] = {
        repo: match.repo,
        skillPath: match.dir,
        matchedBy: "hash",
        adoptedAt: new Date().toISOString(),
      };
      result.adopted.push({ path: installDir, repo: match.repo, name: file.name });
      continue;
    }
    const nameMatches = byName.get(file.name.toLowerCase()) ?? [];
    if (nameMatches.length === 1) {
      result.nameCandidates.push({ path: installDir, repo: nameMatches[0].repo, name: file.name });
    } else {
      result.orphans += 1;
    }
  }

  await writeSources(sources, options.home);
  return result;
}

export async function checkAdopted(
  files: SkillFile[],
  options: { home?: string } = {},
): Promise<UpdateCheck[]> {
  const sources = await readSources(options.home);
  if (Object.keys(sources).length === 0) return [];
  const checks: UpdateCheck[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (file.kind !== "skill" || !file.bodyHash) continue;
    const installDir = deleteTarget(file);
    if (seen.has(installDir)) continue;
    seen.add(installDir);
    const record = sources[installDir];
    if (!record) continue;
    let registryHash = "";
    try {
      registryHash = hashBody(await readFile(join(record.skillPath, "SKILL.md"), "utf8"));
    } catch {
      checks.push({ name: file.name, path: installDir, status: "no-remote", remote: record.repo });
      continue;
    }
    checks.push({
      name: file.name,
      path: installDir,
      status: registryHash === file.bodyHash ? "up-to-date" : "behind",
      remote: record.repo,
      manager: "adopted",
    });
  }
  return checks;
}

export async function applyAdopted(
  checks: UpdateCheck[],
  options: { home?: string } = {},
): Promise<{ updated: number; skipped: number }> {
  const sources = await readSources(options.home);
  let updated = 0;
  let skipped = 0;
  for (const check of checks) {
    if (check.manager !== "adopted" || check.status !== "behind") {
      skipped += 1;
      continue;
    }
    const record = sources[check.path];
    if (!record) {
      skipped += 1;
      continue;
    }
    await quarantine([check.path], { home: options.home });
    await cp(record.skillPath, check.path, { recursive: true });
    updated += 1;
  }
  return { updated, skipped };
}
