import { basename, dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import pc from "picocolors";
import { discover } from "./discover.js";
import { doctor, healthScore, summarizeTokens, type DoctorLimits } from "./doctor.js";
import { formatAudit, formatScan, healthBar } from "./format.js";
import { resolveLinkPlan, applyLinkPlan } from "./manage.js";
import { collapseDeletePaths, planPrune } from "./prune.js";
import { scanSecurity } from "./security.js";
import { quarantine } from "./trash.js";
import { runTui } from "./tui.js";
import type { Finding, LinkPlan, PrunePlan, ScanResult, SecurityFinding, TokenSummary } from "./types.js";

export type Lang = "en" | "zh";

export function detectLang(env: NodeJS.ProcessEnv = process.env): Lang {
  const locale = `${env.LC_ALL ?? ""} ${env.LC_MESSAGES ?? ""} ${env.LANG ?? ""}`.toLowerCase();
  return locale.includes("zh") ? "zh" : "en";
}

const REPO_URL = "https://github.com/iosrxwy/skillint";

const STRINGS = {
  en: {
    scanning: "checking your skills…",
    title: "skillint checkup",
    healthy: "no problems found — your skills look healthy",
    skills: (n: string, tokens: string, ctx: string) =>
      `${n} skills · loading everything would cost ~${tokens} tokens (~${ctx} full context windows)`,
    junkTitle: (n: string, tokens: string) => `${n} duplicates and backups · ~${tokens} wasted tokens`,
    junkHint: "safe to clean; undo any time with `skillint restore`",
    riskTitle: (high: string, rest: string) => `${high} high-risk + ${rest} lower-risk security findings`,
    riskHint: "these skills contain download-and-run commands, key material, or injection wording",
    oversizedTitle: (n: string, name: string, tokens: string) =>
      `${n} oversized skills · biggest: ${name} (~${tokens} tokens)`,
    oversizedHint: "bodies over 4,000 tokens crowd out the agent's working context",
    shareTitle: (n: string) => `${n} identical copies installed for several agents`,
    shareHint: "one canonical copy + symlinks keeps them in sync",
    more: (n: string) => `… and ${n} more`,
    whatNow: "What do you want to do?",
    optFix: (junk: string, share: string) =>
      `fix everything safe: trash ${junk} junk items, share ${share} copies (undoable)`,
    optFixJunkOnly: (junk: string) => `trash the ${junk} junk items (undo: skillint restore)`,
    optFixShareOnly: (share: string) => `share the ${share} identical copies with symlinks (undoable)`,
    optAudit: "show the security findings in detail",
    optUi: "browse everything interactively (q quits)",
    optQuit: "do nothing and exit",
    choose: "choice",
    fixing: "fixing…",
    trashed: (n: string) => `moved ${n} junk item(s) to the recycle bin`,
    linked: (n: string) => `replaced ${n} cop(ies) with symlinks`,
    score: (before: string, after: string) => `health score ${before} → ${after}`,
    undoHint: "undo everything: skillint restore",
    auditHint: "full list: skillint audit -g",
    star: `useful? a GitHub star helps a lot → ${REPO_URL}`,
    bye: "nothing changed. run `skillint` any time.",
  },
  zh: {
    scanning: "正在体检你的 skills…",
    title: "skillint 体检报告",
    healthy: "没发现问题——你的 skills 很健康",
    skills: (n: string, tokens: string, ctx: string) =>
      `已安装 ${n} 个 skill · 全部载入约 ${tokens} token（≈ ${ctx} 个完整上下文窗口）`,
    junkTitle: (n: string, tokens: string) => `${n} 个重复/备份垃圾 · 浪费约 ${tokens} token`,
    junkHint: "可以安全清理，随时用 skillint restore 撤销",
    riskTitle: (high: string, rest: string) => `${high} 处高危 + ${rest} 处需留意的安全风险`,
    riskHint: "这些 skill 里有「下载并执行脚本」、密钥或注入话术",
    oversizedTitle: (n: string, name: string, tokens: string) =>
      `${n} 个超长 skill · 最大的是 ${name}（约 ${tokens} token）`,
    oversizedHint: "单个超过 4,000 token 会挤占 Agent 的思考空间",
    shareTitle: (n: string) => `${n} 个相同副本被装进了多个工具`,
    shareHint: "换成一份正本 + 软链接，改一处处处生效",
    more: (n: string) => `… 还有 ${n} 个`,
    whatNow: "现在要做什么？",
    optFix: (junk: string, share: string) => `一键修复：清 ${junk} 个垃圾 + 共享 ${share} 个副本（可撤销）`,
    optFixJunkOnly: (junk: string) => `把 ${junk} 个垃圾移进回收站（可撤销）`,
    optFixShareOnly: (share: string) => `把 ${share} 个相同副本换成共享链接（可撤销）`,
    optAudit: "看安全风险详情",
    optUi: "打开交互界面慢慢看（按 q 退出）",
    optQuit: "什么都不做，退出",
    choose: "输入序号",
    fixing: "正在修复…",
    trashed: (n: string) => `已把 ${n} 个垃圾移进回收站`,
    linked: (n: string) => `已把 ${n} 个副本换成共享链接`,
    score: (before: string, after: string) => `健康分 ${before} → ${after}`,
    undoHint: "全部可撤销：skillint restore",
    auditHint: "查看全部：skillint audit -g",
    star: `觉得有用？给个 star 是最大的支持 → ${REPO_URL}`,
    bye: "什么都没动。想体检随时运行 skillint。",
  },
} as const;

export interface WizardData {
  result: ScanResult;
  findings: Finding[];
  security: SecurityFinding[];
  prune: PrunePlan;
  link: LinkPlan;
  summary: TokenSummary;
  health: { score: number; label: string };
}

export interface WizardCounts {
  skills: number;
  junk: number;
  risky: number;
  oversized: number;
  shareable: number;
}

export function wizardCounts(data: WizardData): WizardCounts {
  return {
    skills: data.summary.skills,
    junk: data.prune.drop.filter((item) => item.confidence === "safe").length,
    risky: data.security.filter((item) => item.severity !== "info").length,
    oversized: data.findings.filter((item) => item.code === "oversized").length,
    shareable: data.link.actions.filter((item) => item.status === "link").length,
  };
}

function fmt(value: number): string {
  return value.toLocaleString("en-US");
}

function clip(text: string, width: number): string {
  const chars = [...text];
  return chars.length <= width ? text : `${chars.slice(0, width - 1).join("")}…`;
}

function skillName(path: string): string {
  const dir = basename(dirname(path));
  return dir === "." || dir === "" ? basename(path) : dir;
}

export function buildSummary(data: WizardData, lang: Lang): string {
  const t = STRINGS[lang];
  const counts = wizardCounts(data);
  const lines: string[] = [
    "",
    `  ${pc.bold(t.title)}  ${healthBar(data.health.score, 10)} ${data.health.score}/100`,
    "",
    `  ${pc.dim(t.skills(fmt(counts.skills), fmt(data.summary.bodyTokens), fmt(Math.max(1, Math.round(data.summary.bodyTokens / 128000)))))}`,
  ];

  const safeDrops = data.prune.drop.filter((item) => item.confidence === "safe");
  if (safeDrops.length > 0) {
    const wasted = safeDrops.reduce((sum, item) => sum + item.file.bodyTokens, 0);
    lines.push("", `  ${pc.red("●")} ${pc.bold(t.junkTitle(fmt(safeDrops.length), fmt(wasted)))}`);
    for (const item of safeDrops.slice(0, 2)) {
      lines.push(`      ${clip(item.file.name, 30)}  ${pc.dim(clip(item.reason, 52))}`);
    }
    if (safeDrops.length > 2) lines.push(`      ${pc.dim(t.more(fmt(safeDrops.length - 2)))}`);
    lines.push(`      ${pc.dim(t.junkHint)}`);
  }

  const high = data.security.filter((item) => item.severity === "error");
  const mid = data.security.filter((item) => item.severity === "warning");
  if (high.length + mid.length > 0) {
    lines.push("", `  ${pc.yellow("▲")} ${pc.bold(t.riskTitle(fmt(high.length), fmt(mid.length)))}`);
    for (const finding of [...high, ...mid].slice(0, 2)) {
      lines.push(
        `      ${clip(skillName(finding.path), 26)}:${finding.line}  ${pc.dim(clip(finding.excerpt, 48))}`,
      );
    }
    if (high.length + mid.length > 2) lines.push(`      ${pc.dim(t.more(fmt(high.length + mid.length - 2)))}`);
    lines.push(`      ${pc.dim(t.riskHint)}`);
  }

  if (counts.oversized > 0) {
    const biggest = [...data.result.files].sort((a, b) => b.bodyTokens - a.bodyTokens)[0];
    lines.push(
      "",
      `  ${pc.yellow("▲")} ${pc.bold(t.oversizedTitle(fmt(counts.oversized), clip(biggest?.name ?? "?", 28), fmt(biggest?.bodyTokens ?? 0)))}`,
    );
    lines.push(`      ${pc.dim(t.oversizedHint)}`);
  }

  if (counts.shareable > 0) {
    lines.push("", `  ${pc.dim("○")} ${pc.bold(t.shareTitle(fmt(counts.shareable)))}`);
    lines.push(`      ${pc.dim(t.shareHint)}`);
  }

  if (counts.junk === 0 && counts.risky === 0 && counts.oversized === 0 && counts.shareable === 0) {
    lines.push("", `  ${pc.green("✓")} ${t.healthy}`);
  }

  return lines.join("\n");
}

export interface WizardMenuItem {
  key: string;
  label: string;
  action: "fix" | "audit" | "ui" | "quit";
}

export function buildMenu(data: WizardData, lang: Lang): WizardMenuItem[] {
  const t = STRINGS[lang];
  const counts = wizardCounts(data);
  const items: WizardMenuItem[] = [];
  let key = 1;
  if (counts.junk > 0 || counts.shareable > 0) {
    const label =
      counts.junk > 0 && counts.shareable > 0
        ? t.optFix(fmt(counts.junk), fmt(counts.shareable))
        : counts.junk > 0
          ? t.optFixJunkOnly(fmt(counts.junk))
          : t.optFixShareOnly(fmt(counts.shareable));
    items.push({ key: String(key), label, action: "fix" });
    key += 1;
  }
  if (counts.risky > 0) {
    items.push({ key: String(key), label: t.optAudit, action: "audit" });
    key += 1;
  }
  items.push({ key: String(key), label: t.optUi, action: "ui" });
  items.push({ key: "q", label: t.optQuit, action: "quit" });
  return items;
}

export interface WizardOptions {
  extraRoots: string[];
  global: boolean;
  project: boolean;
  ignore: string[];
  limits?: Partial<DoctorLimits>;
}

async function loadData(options: WizardOptions): Promise<WizardData> {
  const result = await discover(options);
  const findings = doctor(result.files, options.limits);
  const [security, link] = await Promise.all([scanSecurity(result.files), resolveLinkPlan(result.files)]);
  return {
    result,
    findings,
    security,
    prune: planPrune(result.files),
    link,
    summary: summarizeTokens(result.files),
    health: healthScore(result.files, findings),
  };
}

async function rescore(options: WizardOptions): Promise<number> {
  const result = await discover(options);
  const findings = doctor(result.files, options.limits);
  return healthScore(result.files, findings).score;
}

export async function runWizard(options: WizardOptions): Promise<void> {
  const lang = detectLang();
  const t = STRINGS[lang];

  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    const started = Date.now();
    const result = await discover(options);
    const summary = summarizeTokens(result.files);
    const findings = doctor(result.files, options.limits);
    console.log(formatScan(result, summary, findings, Date.now() - started));
    return;
  }

  process.stdout.write(pc.dim(`${t.scanning}\n`));
  const data = await loadData(options);
  console.log(buildSummary(data, lang));
  console.log("");

  const menu = buildMenu(data, lang);
  console.log(`  ${pc.bold(t.whatNow)}`);
  for (const item of menu) {
    console.log(`  ${pc.cyan(item.key.padStart(2))}) ${item.label}`);
  }
  console.log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`  ${t.choose} [${menu.map((item) => item.key).join("/")}]: `)).trim();
  rl.close();

  const chosen = menu.find((item) => item.key === answer)?.action ?? "quit";

  if (chosen === "fix") {
    console.log("");
    process.stdout.write(pc.dim(`  ${t.fixing}\n`));
    const before = data.health.score;
    const safePaths = collapseDeletePaths(
      data.prune.drop.filter((item) => item.confidence === "safe").map((item) => item.deletePath),
    );
    if (safePaths.length > 0) {
      const moved = await quarantine(safePaths);
      console.log(`  ${pc.green("✓")} ${t.trashed(fmt(moved.items.length))}`);
    }
    const linkable = data.link.actions.some((item) => item.status === "link");
    if (linkable) {
      const applied = await applyLinkPlan(data.link);
      console.log(`  ${pc.green("✓")} ${t.linked(fmt(applied.linked))}`);
    }
    const after = await rescore(options);
    console.log("");
    console.log(`  ${pc.bold(t.score(String(before), String(after)))}  ${healthBar(after, 10)}`);
    console.log(`  ${pc.dim(t.undoHint)}`);
    console.log("");
    console.log(`  ${pc.yellow("★")} ${t.star}`);
    return;
  }
  if (chosen === "audit") {
    console.log("");
    console.log(formatAudit(data.security, { max: 10, scanned: data.result.files.length }));
    console.log("");
    console.log(`  ${pc.dim(t.auditHint)}`);
    console.log(`  ${pc.yellow("★")} ${t.star}`);
    return;
  }
  if (chosen === "ui") {
    await runTui(options);
    return;
  }
  console.log(`  ${pc.dim(t.bye)}`);
}
