import pc from "picocolors";
import { healthScore } from "./doctor.js";
import type {
  CatalogResult,
  Finding,
  PrunePlan,
  ScanResult,
  SkillFile,
  TokenSummary,
  Visibility,
} from "./types.js";

function n(value: number): string {
  return value.toLocaleString("en-US");
}

function plural(count: number, word: string): string {
  return `${n(count)} ${word}${count === 1 ? "" : "s"}`;
}

function healthLabel(label: string): string {
  if (label === "healthy") return pc.green(label);
  if (label === "fair") return pc.yellow(label);
  if (label === "poor") return pc.red(label);
  return pc.red(label);
}

export function healthBar(score: number, width = 12): string {
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * width);
  const bar = `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
  if (clamped >= 85) return pc.green(bar);
  if (clamped >= 60) return pc.yellow(bar);
  return pc.red(bar);
}

export function formatScan(
  result: ScanResult,
  summary: TokenSummary,
  findings: Finding[] = [],
  elapsedMs?: number,
): string {
  const health = healthScore(result.files, findings);
  const lines = [
    pc.bold("skillint scan · physical inventory"),
    "",
    pc.dim("Cross-agent file inventory and size estimates; use `skillint map` for one agent's catalog."),
    "",
    `${plural(result.roots.length, "root")} · ${plural(summary.skills, "skill")} · ${plural(summary.rules, "rule")}`,
    `health ${String(health.score).padStart(3)}/100  ${healthBar(health.score)}  ${healthLabel(health.label)}`,
    "",
    pc.bold("Inventory size estimate"),
    `  metadata (name + description):  ~${n(summary.metaTokens)} tokens`,
    `  all bodies if fully loaded:     ~${n(summary.bodyTokens)} tokens`,
    `  always-on rules:                ~${n(summary.alwaysOnTokens)} tokens`,
    "",
    pc.bold("By source"),
  ];

  const sources = Object.entries(summary.bySource).sort((a, b) => b[1].files - a[1].files);
  for (const [source, bucket] of sources) {
    lines.push(
      `  ${source.padEnd(22)} ${String(bucket.files).padStart(5)} files   meta ~${n(bucket.metaTokens)}   body ~${n(bucket.bodyTokens)}`,
    );
  }

  const largest = [...result.files].sort((a, b) => b.bodyTokens - a.bodyTokens).slice(0, 10);
  if (largest.length) {
    lines.push("", pc.bold("Largest files"));
    for (const file of largest) {
      lines.push(`  ${String(file.bodyTokens).padStart(6)} tok  ${file.kind.padEnd(5)}  ${file.name}  ${pc.dim(file.path)}`);
    }
  }

  if (findings.length) {
    lines.push("", pc.dim(`Run \`skillint doctor\` for ${n(findings.length)} diagnostic details.`));
  }
  if (elapsedMs != null) {
    lines.push("", pc.dim(`scanned in ${formatDuration(elapsedMs)}`));
  }

  return lines.join("\n");
}

export function formatMap(result: CatalogResult): string {
  const counts = new Map<Visibility, number>();
  for (const resource of result.resources) {
    counts.set(resource.visibility, (counts.get(resource.visibility) ?? 0) + 1);
  }
  const count = (visibility: Visibility) => counts.get(visibility) ?? 0;
  const lines = [
    pc.bold(`skillint map · ${result.agent}`),
    "",
    pc.dim("Static catalog resolution only; this does not predict model triggering."),
    `cwd          ${result.cwd}`,
    `project root ${result.projectRoot}`,
    "",
    `${plural(result.resources.length, "resource")} · ${count("effective")} effective · ${count("coexisting")} coexisting · ${count("shadowed")} shadowed · ${count("conditional")} conditional · ${count("unknown")} unknown`,
  ];

  if (result.resources.length === 0) {
    lines.push("", pc.dim("No observable resources found."));
  } else {
    lines.push("", pc.bold("Resources"));
    for (const resource of result.resources) {
      const status =
        resource.visibility === "effective"
          ? pc.green(resource.visibility)
          : resource.visibility === "shadowed"
            ? pc.dim(resource.visibility)
            : resource.visibility === "unknown"
              ? pc.yellow(resource.visibility)
              : resource.visibility;
      lines.push(
        `  ${status.padEnd(11)} ${resource.role.padEnd(11)} ${resource.scope.padEnd(9)} ${resource.sourceKind.padEnd(14)} ${resource.name}`,
      );
      lines.push(`  ${"".padEnd(49)}${pc.dim(resource.logicalPath)}`);
      if (resource.realPath !== resource.logicalPath) {
        lines.push(`  ${"".padEnd(49)}${pc.dim(`real → ${resource.realPath}`)}`);
      }
    }
  }

  if (result.notices.length > 0) {
    lines.push("", pc.bold("Unknowns"));
    for (const notice of result.notices) {
      lines.push(`  ? ${notice.message}`);
    }
  }

  return lines.join("\n");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatDoctor(
  findings: Finding[],
  options: { max?: number; health?: { score: number; label: string } } = {},
): string {
  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const infos = findings.filter((item) => item.severity === "info").length;
  const max = options.max ?? 40;

  const lines = [
    pc.bold("skillint doctor"),
    "",
  ];
  if (options.health) {
    lines.push(
      `health ${String(options.health.score).padStart(3)}/100  ${healthBar(options.health.score)}  ${healthLabel(options.health.label)}`,
      "",
    );
  }
  lines.push(
    `${pc.red(plural(errors, "error"))}  ${pc.yellow(plural(warnings, "warning"))}  ${pc.dim(plural(infos, "info"))}`,
  );

  if (!findings.length) {
    lines.push("", pc.green("No issues found."));
    return lines.join("\n");
  }

  const byCode = new Map<string, number>();
  for (const finding of findings) {
    byCode.set(finding.code, (byCode.get(finding.code) ?? 0) + 1);
  }
  lines.push("", pc.bold("By rule"));
  for (const [code, count] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${code.padEnd(24)} ${n(count)}`);
  }

  const shown = findings.slice(0, max);
  lines.push("", pc.bold("Details"));
  for (const finding of shown) {
    const tag =
      finding.severity === "error"
        ? pc.red(finding.code)
        : finding.severity === "warning"
          ? pc.yellow(finding.code)
          : pc.dim(finding.code);
    lines.push(`  ${tag}  ${finding.message}`);
    lines.push(`           ${pc.dim(finding.path)}`);
    const related = (finding.extra ?? "")
      .split(", ")
      .filter((path) => path && path !== finding.path);
    for (const path of related.slice(0, 3)) {
      lines.push(`           ${pc.dim(`↳ ${path}`)}`);
    }
    if (related.length > 3) {
      lines.push(`           ${pc.dim(`↳ … ${n(related.length - 3)} more related paths`)}`);
    }
  }
  if (findings.length > shown.length) {
    lines.push("", pc.dim(`… ${n(findings.length - shown.length)} more. Use --json for the full list.`));
  }

  return lines.join("\n");
}

export function formatTokens(summary: TokenSummary): string {
  return [
    pc.bold("skillint tokens"),
    "",
    `files:        ${n(summary.files)}`,
    `skills:       ${n(summary.skills)}`,
    `rules:        ${n(summary.rules)}`,
    `meta tokens:  ~${n(summary.metaTokens)}`,
    `body tokens:  ~${n(summary.bodyTokens)}`,
    `always-on:    ~${n(summary.alwaysOnTokens)}`,
  ].join("\n");
}

export function formatPrune(plan: PrunePlan, options: { max?: number } = {}): string {
  const max = options.max ?? 40;
  const lines = [
    pc.bold("skillint prune"),
    "",
    pc.dim("skillint never deletes files. This is a suggestion list only."),
    "",
    pc.green(`keep ${plan.keep.length}`),
  ];
  for (const file of plan.keep.slice(0, max)) {
    lines.push(`  + ${file.name}  ${pc.dim(file.path)}`);
  }
  if (plan.keep.length > max) {
    lines.push(pc.dim(`  … ${n(plan.keep.length - max)} more kept`));
  }
  const drop = plan.drop.slice(0, max);
  lines.push("", pc.red(`consider dropping ${plan.drop.length}`));
  for (const item of drop) {
    lines.push(`  - ${item.file.name}  ${item.reason}`);
    lines.push(`      ${pc.dim(item.file.path)}`);
  }
  if (plan.drop.length > drop.length) {
    lines.push(pc.dim(`  … ${n(plan.drop.length - drop.length)} more. Use --json for the full list.`));
  }
  return lines.join("\n");
}

export function toJson(payload: unknown): string {
  return `${JSON.stringify(payload, jsonReplacer, 2)}\n`;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value == null) {
    return value;
  }
  if (Array.isArray(value) || typeof value === "object") return value;
  return String(value);
}

export function formatGithubSummary(input: {
  command: string;
  health: { score: number; label: string };
  summary?: TokenSummary;
  findings?: Finding[];
}): string {
  const errors = input.findings?.filter((item) => item.severity === "error").length ?? 0;
  const warnings = input.findings?.filter((item) => item.severity === "warning").length ?? 0;
  const lines = [
    `## skillint ${input.command}`,
    "",
    `Health **${input.health.score}/100** (${input.health.label})`,
  ];
  if (input.summary) {
    lines.push(
      "",
      `| Skills | Rules | Meta tokens | Body tokens | Errors | Warnings |`,
      `| ---: | ---: | ---: | ---: | ---: | ---: |`,
      `| ${n(input.summary.skills)} | ${n(input.summary.rules)} | ${n(input.summary.metaTokens)} | ${n(input.summary.bodyTokens)} | ${n(errors)} | ${n(warnings)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function compactFiles(files: SkillFile[]) {
  return files.map((file) => ({
    name: file.name,
    kind: file.kind,
    source: file.source,
    path: file.path,
    description: file.description,
    hasFrontmatter: file.hasFrontmatter,
    frontmatterError: file.frontmatterError,
    hasDeclaredName: file.hasDeclaredName,
    alwaysApply: file.alwaysApply,
    metaTokens: file.metaTokens,
    bodyTokens: file.bodyTokens,
    bodyLines: file.bodyLines,
    bodyHash: file.bodyHash,
  }));
}
