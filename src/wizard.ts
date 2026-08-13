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

const STRINGS = {
  en: {
    scanning: "checking your skills…",
    title: "skillint checkup",
    healthy: "no problems found — your skills look healthy",
    skills: (n: string) => `${n} skills installed`,
    junk: (n: string) => `${n} duplicates/backups — safe to clean (undoable)`,
    risky: (n: string) => `${n} security findings — some skills pipe scripts from the internet`,
    oversized: (n: string) => `${n} oversized skills slow agents down`,
    shareable: (n: string) => `${n} identical copies could be shared across agents`,
    whatNow: "What do you want to do?",
    optClean: (n: string) => `move the ${n} junk items to the recycle bin (undo: skillint restore)`,
    optAudit: "show the security findings",
    optShare: (n: string) => `share the ${n} identical copies with symlinks (undoable)`,
    optUi: "open the interactive browser (q quits it)",
    optQuit: "do nothing and exit",
    choose: "choice",
    cleaned: (n: string, dir: string) => `${n} item(s) moved to ${dir}`,
    undoHint: "changed your mind? run: skillint restore",
    linked: (n: string) => `${n} copies replaced with symlinks`,
    auditHint: "full list: skillint audit -g",
    bye: "nothing changed. run `skillint` any time.",
    notTty: "",
  },
  zh: {
    scanning: "正在体检你的 skills…",
    title: "skillint 体检报告",
    healthy: "没发现问题——你的 skills 很健康",
    skills: (n: string) => `已安装 ${n} 个 skill`,
    junk: (n: string) => `${n} 个重复/备份垃圾——可以安全清理（可撤销）`,
    risky: (n: string) => `${n} 个安全风险——有 skill 会从网上下载并执行脚本`,
    oversized: (n: string) => `${n} 个超长 skill 拖慢 Agent`,
    shareable: (n: string) => `${n} 个跨工具的相同副本可以共享`,
    whatNow: "现在要做什么？",
    optClean: (n: string) => `把 ${n} 个垃圾移进回收站（skillint restore 可撤销）`,
    optAudit: "看看安全风险都是什么",
    optShare: (n: string) => `把 ${n} 个相同副本换成共享链接（可撤销）`,
    optUi: "打开交互界面慢慢看（按 q 退出）",
    optQuit: "什么都不做，退出",
    choose: "输入序号",
    cleaned: (n: string, dir: string) => `已把 ${n} 个条目移入 ${dir}`,
    undoHint: "后悔了？运行：skillint restore",
    linked: (n: string) => `已把 ${n} 个副本换成共享链接`,
    auditHint: "查看全部：skillint audit -g",
    bye: "什么都没动。想体检随时运行 skillint。",
    notTty: "",
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

export function buildSummary(data: WizardData, lang: Lang): string {
  const t = STRINGS[lang];
  const counts = wizardCounts(data);
  const lines = [
    "",
    `  ${pc.bold(t.title)}  ${healthBar(data.health.score, 10)} ${data.health.score}/100`,
    "",
    `  ${pc.dim(t.skills(fmt(counts.skills)))}`,
    "",
  ];
  const problems: string[] = [];
  if (counts.junk > 0) problems.push(`  ${pc.red("●")} ${t.junk(fmt(counts.junk))}`);
  if (counts.risky > 0) problems.push(`  ${pc.yellow("▲")} ${t.risky(fmt(counts.risky))}`);
  if (counts.oversized > 0) problems.push(`  ${pc.yellow("▲")} ${t.oversized(fmt(counts.oversized))}`);
  if (counts.shareable > 0) problems.push(`  ${pc.dim("○")} ${t.shareable(fmt(counts.shareable))}`);
  if (problems.length === 0) {
    lines.push(`  ${pc.green("✓")} ${t.healthy}`);
  } else {
    lines.push(...problems);
  }
  return lines.join("\n");
}

export interface WizardMenuItem {
  key: string;
  label: string;
  action: "clean" | "audit" | "share" | "ui" | "quit";
}

export function buildMenu(data: WizardData, lang: Lang): WizardMenuItem[] {
  const t = STRINGS[lang];
  const counts = wizardCounts(data);
  const items: WizardMenuItem[] = [];
  let key = 1;
  if (counts.junk > 0) {
    items.push({ key: String(key), label: t.optClean(fmt(counts.junk)), action: "clean" });
    key += 1;
  }
  if (counts.risky > 0) {
    items.push({ key: String(key), label: t.optAudit, action: "audit" });
    key += 1;
  }
  if (counts.shareable > 0) {
    items.push({ key: String(key), label: t.optShare(fmt(counts.shareable)), action: "share" });
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

  if (chosen === "clean") {
    const safePaths = collapseDeletePaths(
      data.prune.drop.filter((item) => item.confidence === "safe").map((item) => item.deletePath),
    );
    const moved = await quarantine(safePaths);
    console.log("");
    console.log(`  ${pc.green("✓")} ${t.cleaned(fmt(moved.items.length), moved.batchDir)}`);
    console.log(`  ${pc.dim(t.undoHint)}`);
    return;
  }
  if (chosen === "audit") {
    console.log("");
    console.log(formatAudit(data.security, { max: 10, scanned: data.result.files.length }));
    console.log("");
    console.log(`  ${pc.dim(t.auditHint)}`);
    return;
  }
  if (chosen === "share") {
    const applied = await applyLinkPlan(data.link);
    console.log("");
    console.log(`  ${pc.green("✓")} ${t.linked(fmt(applied.linked))}`);
    console.log(`  ${pc.dim(t.undoHint)}`);
    return;
  }
  if (chosen === "ui") {
    await runTui(options);
    return;
  }
  console.log(`  ${pc.dim(t.bye)}`);
}
