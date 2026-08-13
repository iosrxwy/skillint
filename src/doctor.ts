import { basename } from "node:path";
import type { Finding, SkillFile, TokenSummary } from "./types.js";

const SKILL_BODY_LIMIT = 4000;
const RULE_ALWAYS_ON_LIMIT = 800;
const DESCRIPTION_LIMIT = 1024;
const DESCRIPTION_MIN = 40;
const AGENTS_LINE_LIMIT = 100;
const FIRST_PERSON = /^(i |i'm |i am |i can |i will )/i;
const AGENT_DOCS = new Set([
  "agents.md",
  "agent.md",
  "claude.md",
  "claude.local.md",
  "gemini.md",
  "grok.md",
  "codex.md",
  "copilot.md",
  "windsurf.md",
  "opencode.md",
  "kiro.md",
]);

export function sourceFamily(source: string): string {
  if (source === "project-root" || source === "custom") return source;
  return source.replace(/-(global|project)$/, "");
}

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

export function healthScore(files: SkillFile[], findings: Finding[]): { score: number; label: string } {
  let score = 100;
  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const skills = files.filter((file) => file.kind === "skill").length;

  score -= Math.min(40, errors * 4);
  score -= Math.min(30, warnings);
  if (skills > 200) score -= 10;
  if (skills > 800) score -= 10;
  score = Math.max(0, Math.min(100, score));

  const label = score >= 85 ? "healthy" : score >= 60 ? "fair" : score >= 40 ? "poor" : "critical";
  return { score, label };
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
    } else {
      if (file.description.length > DESCRIPTION_LIMIT) {
        findings.push({
          code: "description-too-long",
          severity: "warning",
          message: `Description is ${file.description.length} chars (limit ${DESCRIPTION_LIMIT})`,
          path: file.path,
        });
      } else if (file.kind === "skill" && file.description.length < DESCRIPTION_MIN) {
        findings.push({
          code: "description-too-short",
          severity: "warning",
          message: `Description is ${file.description.length} chars (keep at least ${DESCRIPTION_MIN})`,
          path: file.path,
        });
      }
      if (file.kind === "skill" && FIRST_PERSON.test(file.description)) {
        findings.push({
          code: "description-first-person",
          severity: "info",
          message: "Description should be third person so agents can inject it into a system prompt",
          path: file.path,
        });
      }
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

    if (file.kind === "rule" && AGENT_DOCS.has(basename(file.path).toLowerCase()) && file.bodyLines > AGENTS_LINE_LIMIT) {
      findings.push({
        code: "agents-doc-too-long",
        severity: "warning",
        message: `${basename(file.path)} is ${file.bodyLines} lines (keep under ${AGENTS_LINE_LIMIT})`,
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
    const byFamily = new Map<string, SkillFile[]>();
    for (const file of list) {
      const family = sourceFamily(file.source);
      const group = byFamily.get(family) ?? [];
      group.push(file);
      byFamily.set(family, group);
    }
    for (const [family, group] of byFamily) {
      if (group.length < 2) continue;
      findings.push({
        code: "duplicate-name",
        severity: "error",
        message: `Duplicate name "${name}" found ${group.length} times in ${family}`,
        path: group[0].path,
        extra: group.map((item) => item.path).join(", "),
      });
    }
    if (byFamily.size >= 2) {
      const families = [...byFamily.keys()].sort();
      findings.push({
        code: "synced-copy",
        severity: "info",
        message: `Name "${name}" is installed in ${families.length} agent catalogs (${families.join(", ")})`,
        path: list[0].path,
        extra: list.map((item) => item.path).join(", "),
      });
    }
  }

  const byHash = new Map<string, SkillFile[]>();
  for (const file of files) {
    if (!file.bodyHash) continue;
    const list = byHash.get(file.bodyHash) ?? [];
    list.push(file);
    byHash.set(file.bodyHash, list);
  }
  for (const group of byHash.values()) {
    if (group.length < 2) continue;
    const byFamily = new Map<string, SkillFile[]>();
    for (const file of group) {
      const family = sourceFamily(file.source);
      const list = byFamily.get(family) ?? [];
      list.push(file);
      byFamily.set(family, list);
    }
    for (const [family, copies] of byFamily) {
      if (copies.length < 2) continue;
      const names = [...new Set(copies.map((item) => item.name.toLowerCase()))];
      if (names.length < 2) continue;
      findings.push({
        code: "duplicate-content",
        severity: "warning",
        message: `Same body stored under ${names.length} names in ${family}`,
        path: copies[0].path,
        extra: copies.map((item) => item.path).join(", "),
      });
    }
  }

  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code) || a.path.localeCompare(b.path));
  return findings;
}
