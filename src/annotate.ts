import { isAbsolute, relative } from "node:path";
import type { Finding } from "./types.js";

function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function repoPath(filePath: string, workspace: string): string {
  const rel = relative(workspace, filePath);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return filePath;
  return rel;
}

export function formatGithubAnnotations(
  findings: Finding[],
  workspace = process.env.GITHUB_WORKSPACE ?? process.cwd(),
): string {
  const lines: string[] = [];
  for (const finding of findings) {
    if (finding.severity === "info") continue;
    const level = finding.severity === "error" ? "error" : "warning";
    const file = repoPath(finding.path, workspace);
    lines.push(
      `::${level} file=${file},title=${finding.code}::${escapeData(finding.message)}`,
    );
  }
  return lines.join("\n");
}

export function shouldAnnotate(force?: boolean): boolean {
  return force === true || process.env.GITHUB_ACTIONS === "true";
}
