import type { Finding, ScanResult, TokenSummary } from "./types.js";

function n(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatReport(input: {
  generatedAt: string;
  result: ScanResult;
  summary: TokenSummary;
  findings: Finding[];
  health?: { score: number; label: string };
}): string {
  const { generatedAt, result, summary, findings, health } = input;
  const errors = findings.filter((item) => item.severity === "error");
  const warnings = findings.filter((item) => item.severity === "warning");
  const infos = findings.filter((item) => item.severity === "info");
  const largest = [...result.files].sort((a, b) => b.bodyTokens - a.bodyTokens).slice(0, 15);

  const lines = [
    "# skillint report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| Roots | ${n(result.roots.length)} |`,
    `| Files | ${n(summary.files)} |`,
    `| Skills | ${n(summary.skills)} |`,
    `| Rules | ${n(summary.rules)} |`,
    `| Health | ${health ? `${health.score}/100 ${health.label}` : "n/a"} |`,
    `| Metadata tokens (est.) | ${n(summary.metaTokens)} |`,
    `| Body tokens (est.) | ${n(summary.bodyTokens)} |`,
    `| Always-on rule tokens (est.) | ${n(summary.alwaysOnTokens)} |`,
    `| Doctor errors | ${n(errors.length)} |`,
    `| Doctor warnings | ${n(warnings.length)} |`,
    `| Doctor infos | ${n(infos.length)} |`,
    "",
    "## Roots",
    "",
    ...result.roots.map((root) => `- \`${root}\``),
    "",
    "## Context cost by source",
    "",
    `| Source | Files | Metadata tokens | Body tokens |`,
    `| --- | ---: | ---: | ---: |`,
  ];

  const sources = Object.entries(summary.bySource).sort((a, b) => b[1].files - a[1].files);
  for (const [source, bucket] of sources) {
    lines.push(`| ${source} | ${n(bucket.files)} | ${n(bucket.metaTokens)} | ${n(bucket.bodyTokens)} |`);
  }

  lines.push("", "## Findings", "");
  if (!findings.length) {
    lines.push("No issues found.");
  } else {
    lines.push(`| Severity | Code | Message | Path | Related paths |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const finding of findings) {
      lines.push(
        `| ${finding.severity} | \`${finding.code}\` | ${escapeCell(finding.message)} | \`${escapeCell(finding.path)}\` | ${formatRelated(finding)} |`,
      );
    }
  }

  lines.push("", "## Largest files", "");
  lines.push(`| Tokens | Kind | Name | Path |`);
  lines.push(`| ---: | --- | --- | --- |`);
  for (const file of largest) {
    lines.push(`| ${n(file.bodyTokens)} | ${file.kind} | ${escapeCell(file.name)} | \`${escapeCell(file.path)}\` |`);
  }

  lines.push(
    "",
    "## Notes",
    "",
    "- Token counts are estimates (`characters / 4`), not a vendor tokenizer.",
    "- This report is read-only. `skillint` never deletes skill files.",
    "",
  );

  return lines.join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatRelated(finding: Finding): string {
  const related = (finding.extra ?? "")
    .split(", ")
    .filter((path) => path && path !== finding.path);
  return related.map((path) => `\`${escapeCell(path)}\``).join("<br>");
}

