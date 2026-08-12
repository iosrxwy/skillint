import type { Finding, SkillFile, TokenSummary } from "./types.js";

const SKILL_BODY_LIMIT = 4000;
const RULE_ALWAYS_ON_LIMIT = 800;
const DESCRIPTION_LIMIT = 1024;

export function summarizeTokens(files: SkillFile[]): TokenSummary {
  const bySource: TokenSummary["bySource"] = {};
  const summary: TokenSummary = {
    files: files.length,
    skills: 0,
    rules: 0,
    metaTokens: 0,
    bodyTokens: 0,
    alwaysOnTokens: 0,
    bySource,
  };

  for (const file of files) {
    if (file.kind === "skill") summary.skills += 1;
    else summary.rules += 1;
    summary.metaTokens += file.metaTokens;
    summary.bodyTokens += file.bodyTokens;
    if (file.kind === "rule" && file.alwaysApply) {
      summary.alwaysOnTokens += file.bodyTokens;
    }
    const bucket = bySource[file.source] ?? { files: 0, metaTokens: 0, bodyTokens: 0 };
    bucket.files += 1;
    bucket.metaTokens += file.metaTokens;
    bucket.bodyTokens += file.bodyTokens;
    bySource[file.source] = bucket;
  }

  return summary;
}

export function doctor(files: SkillFile[]): Finding[] {
  const findings: Finding[] = [];
  const byName = new Map<string, SkillFile[]>();

  for (const file of files) {
    const key = file.name.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(file);
    byName.set(key, list);

    if (file.kind === "skill" && !file.name.trim()) {
      findings.push({
        code: "missing-name",
        severity: "error",
        message: "Skill is missing a name",
        path: file.path,
      });
    }

    if (!file.description) {
      findings.push({
        code: "missing-description",
        severity: file.kind === "skill" ? "error" : "warning",
        message: `${file.kind === "skill" ? "Skill" : "Rule"} is missing a description`,
        path: file.path,
      });
    } else if (file.description.length > DESCRIPTION_LIMIT) {
      findings.push({
        code: "description-too-long",
        severity: "warning",
        message: `Description is ${file.description.length} chars (limit ${DESCRIPTION_LIMIT})`,
        path: file.path,
      });
    }

    if (file.bodyChars === 0) {
      findings.push({
        code: "empty-body",
        severity: "warning",
        message: "File has frontmatter but an empty body",
        path: file.path,
      });
    }

    if (file.kind === "skill" && file.bodyTokens > SKILL_BODY_LIMIT) {
      findings.push({
        code: "oversized",
        severity: "warning",
        message: `Skill body is ~${file.bodyTokens} tokens (keep under ${SKILL_BODY_LIMIT})`,
        path: file.path,
      });
    }

    if (file.kind === "rule" && file.alwaysApply && file.bodyTokens > RULE_ALWAYS_ON_LIMIT) {
      findings.push({
        code: "always-on-bloat",
        severity: "warning",
        message: `alwaysApply rule is ~${file.bodyTokens} tokens (keep under ${RULE_ALWAYS_ON_LIMIT})`,
        path: file.path,
      });
    }

    if (file.kind === "skill") {
      const folder = file.path.split(/[/\\]/).slice(-2, -1)[0] ?? "";
      if (folder && folder !== "." && folder.toLowerCase() !== file.name.toLowerCase()) {
        findings.push({
          code: "name-folder-mismatch",
          severity: "info",
          message: `Folder "${folder}" does not match name "${file.name}"`,
          path: file.path,
        });
      }
    }
  }

  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    const paths = list.map((item) => item.path).join(", ");
    for (const file of list) {
      findings.push({
        code: "duplicate-name",
        severity: "error",
        message: `Duplicate name "${name}" found ${list.length} times`,
        path: file.path,
        extra: paths,
      });
    }
  }

  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.path.localeCompare(b.path));
  return findings;
}
