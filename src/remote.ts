import { execFile } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { scanSecurity } from "./security.js";
import { walkBounded } from "./walk.js";
import type { SecurityFinding, SkillFile } from "./types.js";

const execFileAsync = promisify(execFile);

export type RemoteVerdict = "clean" | "caution" | "risky" | "unreachable";

export interface RemoteScanResult {
  repo: string;
  verdict: RemoteVerdict;
  skills: number;
  files: number;
  errors: number;
  warnings: number;
  infos: number;
  findings: SecurityFinding[];
}

function cacheRoot(home = homedir()): string {
  return join(home, ".skillint", "remote-cache");
}

async function git(args: string[], cwd?: string): Promise<boolean> {
  try {
    await execFileAsync("git", cwd ? ["-C", cwd, ...args] : args, { encoding: "utf8", timeout: 120_000 });
    return true;
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function materialize(repo: string, home?: string): Promise<string | null> {
  if (await exists(repo)) return resolve(repo);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const dir = join(cacheRoot(home), repo.replace(/\//g, "__"));
  if (await exists(join(dir, ".git"))) {
    await git(["fetch", "--depth", "1", "origin"], dir);
    await git(["reset", "--hard", "origin/HEAD"], dir);
    return dir;
  }
  await mkdir(dirname(dir), { recursive: true });
  await rm(dir, { recursive: true, force: true });
  const ok = await git(["clone", "--depth", "1", `https://github.com/${repo}.git`, dir]);
  return ok ? dir : null;
}

function stubFile(path: string): SkillFile {
  return {
    path,
    kind: "skill",
    source: "remote",
    name: basename(dirname(path)),
    description: "",
    alwaysApply: false,
    bytes: 0,
    mtimeMs: 0,
    bodyChars: 0,
    bodyLines: 0,
    metaTokens: 0,
    bodyTokens: 0,
    bodyHash: "",
  };
}

const SCANNABLE = new Set(["skill.md", "agents.md", "claude.md", "readme.md"]);

export async function scanRemoteRepo(repo: string, options: { home?: string } = {}): Promise<RemoteScanResult> {
  const dir = await materialize(repo, options.home);
  if (!dir) {
    return { repo, verdict: "unreachable", skills: 0, files: 0, errors: 0, warnings: 0, infos: 0, findings: [] };
  }
  const walked = await walkBounded(dir, { maxDepth: 6 });
  const skillFiles = walked.files.filter((file) => basename(file.logicalPath).toLowerCase() === "skill.md");
  const scanTargets = walked.files.filter((file) => {
    const name = basename(file.logicalPath).toLowerCase();
    return SCANNABLE.has(name) || name.endsWith(".sh");
  });
  const findings = await scanSecurity(scanTargets.map((file) => stubFile(file.realPath)));
  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const infos = findings.filter((item) => item.severity === "info").length;
  const verdict: RemoteVerdict = errors > 0 ? "risky" : warnings > 0 ? "caution" : "clean";
  return {
    repo,
    verdict,
    skills: skillFiles.length,
    files: scanTargets.length,
    errors,
    warnings,
    infos,
    findings,
  };
}

export async function scanRemoteRepos(
  repos: string[],
  options: { home?: string } = {},
): Promise<RemoteScanResult[]> {
  const results: RemoteScanResult[] = [];
  for (const repo of repos) {
    results.push(await scanRemoteRepo(repo, options));
  }
  return results;
}

const VERDICT_ICON: Record<RemoteVerdict, string> = {
  clean: "🟢",
  caution: "🟡",
  risky: "🔴",
  unreachable: "⚪",
};

export function formatObservatory(results: RemoteScanResult[], generatedAt: string): string {
  const sorted = [...results].sort((a, b) => b.errors - a.errors || b.warnings - a.warnings || a.repo.localeCompare(b.repo));
  const lines = [
    "# Skill Security Observatory",
    "",
    `Generated ${generatedAt} by [\`skillint scan-remote\`](https://github.com/iosrxwy/skillint). Static pattern scan of public skill repositories — nothing is executed, and a finding is a *lead to review*, not a conviction. Install instructions inside a skill (e.g. \`curl | bash\`) are exactly what an agent may run on your machine.`,
    "",
    "| Repository | Verdict | Skills | High-risk | Warnings | Notes |",
    "| --- | --- | ---: | ---: | ---: | --- |",
  ];
  for (const result of sorted) {
    const top = result.findings.find((item) => item.severity === "error") ?? result.findings[0];
    const note = result.verdict === "unreachable" ? "clone failed" : top ? `\`${top.code}\` ${top.path.split("/").slice(-2)[0] ?? ""}:${top.line}` : "no dangerous patterns";
    lines.push(
      `| [${result.repo}](https://github.com/${result.repo}) | ${VERDICT_ICON[result.verdict]} ${result.verdict} | ${result.skills} | ${result.errors} | ${result.warnings} | ${note} |`,
    );
  }
  lines.push(
    "",
    "Run it yourself before installing anything:",
    "",
    "```bash",
    "npx skillint scan-remote owner/repo",
    "```",
    "",
  );
  return lines.join("\n");
}

export function formatRemoteText(result: RemoteScanResult, max = 20): string {
  const lines = [
    `${result.repo}  ${VERDICT_ICON[result.verdict]} ${result.verdict}`,
    `  skills ${result.skills} · scanned files ${result.files} · high-risk ${result.errors} · warnings ${result.warnings} · info ${result.infos}`,
  ];
  for (const finding of result.findings.slice(0, max)) {
    lines.push(`  [${finding.severity}] ${finding.code}  ${finding.path.split("/").slice(-3).join("/")}:${finding.line}`);
    lines.push(`      > ${finding.excerpt}`);
  }
  if (result.findings.length > max) {
    lines.push(`  … ${result.findings.length - max} more (use --json)`);
  }
  return lines.join("\n");
}

export const OBSERVATORY_TMP = tmpdir();
