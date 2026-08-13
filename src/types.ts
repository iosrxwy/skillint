export type Kind = "skill" | "rule";

export type Source = string;

export interface SkillFile {
  path: string;
  kind: Kind;
  source: Source;
  name: string;
  description: string;
  alwaysApply: boolean;
  bytes: number;
  mtimeMs: number;
  bodyChars: number;
  bodyLines: number;
  metaTokens: number;
  bodyTokens: number;
}

export type FindingSeverity = "error" | "warning" | "info";

export type FindingCode =
  | "duplicate-name"
  | "missing-name"
  | "missing-description"
  | "empty-body"
  | "oversized"
  | "name-folder-mismatch"
  | "description-too-long"
  | "description-too-short"
  | "description-first-person"
  | "always-on-bloat"
  | "agents-doc-too-long";

export interface Finding {
  code: FindingCode;
  severity: FindingSeverity;
  message: string;
  path: string;
  extra?: string;
}

export interface ScanResult {
  files: SkillFile[];
  roots: string[];
}

export interface TokenSummary {
  files: number;
  skills: number;
  rules: number;
  metaTokens: number;
  bodyTokens: number;
  alwaysOnTokens: number;
  bySource: Record<string, { files: number; metaTokens: number; bodyTokens: number }>;
}

export interface PrunePlan {
  keep: SkillFile[];
  drop: Array<{ file: SkillFile; reason: string }>;
}
