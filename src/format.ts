import pc from "picocolors";
import type { Finding, PrunePlan, ScanResult, SkillFile, TokenSummary } from "./types.js";

function n(value: number): string {
  return value.toLocaleString("en-US");
}

function plural(count: number, word: string): string {
  return `${n(count)} ${word}${count === 1 ? "" : "s"}`;
}

export function formatScan(result: ScanResult, summary: TokenSummary): string {
  const lines = [
    pc.bold("skillint scan"),
    "",
    `${plural(result.roots.length, "root")} · ${plural(summary.skills, "skill")} · ${plural(summary.rules, "rule")}`,
    "",
    pc.bold("Context cost"),
    `  metadata (name + description):  ~${n(summary.metaTokens)} tokens`,
    `  all bodies if fully loaded:     ~${n(summary.bodyTokens)} tokens`,
    `  always-on rules:                ~${n(summary.alwaysOnTokens)} tokens`,
    "",
    pc.bold("By source"),
  ];

  const sources = Object.entries(summary.bySource).sort((a, b) => b[1].files - a[1].files);
  for (const [source, bucket] of sources) {
    lines.push(
      `  ${source.padEnd(16)} ${String(bucket.files).padStart(5)} files   meta ~${n(bucket.metaTokens)}   body ~${n(bucket.bodyTokens)}`,
    );
  }

  const largest = [...result.files].sort((a, b) => b.bodyTokens - a.bodyTokens).slice(0, 10);
  if (largest.length) {
    lines.push("", pc.bold("Largest files"));
    for (const file of largest) {
      lines.push(`  ${String(file.bodyTokens).padStart(6)} tok  ${file.kind.padEnd(5)}  ${file.name}  ${pc.dim(file.path)}`);
    }
  }

  return lines.join("\n");
}

export function formatDoctor(findings: Finding[]): string {
  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const infos = findings.filter((item) => item.severity === "info").length;

  const lines = [
    pc.bold("skillint doctor"),
    "",
    `${pc.red(plural(errors, "error"))}  ${pc.yellow(plural(warnings, "warning"))}  ${pc.dim(plural(infos, "info"))}`,
  ];

  if (!findings.length) {
    lines.push("", pc.green("No issues found."));
    return lines.join("\n");
  }

  lines.push("");
  for (const finding of findings) {
    const tag =
      finding.severity === "error"
        ? pc.red(finding.code)
        : finding.severity === "warning"
          ? pc.yellow(finding.code)
          : pc.dim(finding.code);
    lines.push(`  ${tag}  ${finding.message}`);
    lines.push(`           ${pc.dim(finding.path)}`);
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

export function formatPrune(plan: PrunePlan): string {
  const lines = [
    pc.bold("skillint prune"),
    "",
    pc.dim("skillint never deletes files. This is a suggestion list only."),
    "",
    pc.green(`keep ${plan.keep.length}`),
  ];
  for (const file of plan.keep) {
    lines.push(`  + ${file.name}  ${pc.dim(file.path)}`);
  }
  lines.push("", pc.red(`consider dropping ${plan.drop.length}`));
  for (const item of plan.drop) {
    lines.push(`  - ${item.file.name}  ${item.reason}`);
    lines.push(`      ${pc.dim(item.file.path)}`);
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

export function compactFiles(files: SkillFile[]) {
  return files.map((file) => ({
    name: file.name,
    kind: file.kind,
    source: file.source,
    path: file.path,
    description: file.description,
    alwaysApply: file.alwaysApply,
    metaTokens: file.metaTokens,
    bodyTokens: file.bodyTokens,
  }));
}
