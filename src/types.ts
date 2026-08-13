export type Kind = "skill" | "rule";

export type Source = string;

export type Agent = "cursor" | "claude" | "codex";
export type Scope = "managed" | "admin" | "system" | "user" | "project" | "directory";
export type ResourceRole = "skill" | "rule" | "instruction";
export type Visibility = "effective" | "coexisting" | "shadowed" | "conditional" | "unknown";
export type Resolution =
  | "direct"
  | "instruction-chain"
  | "same-name-coexists"
  | "higher-precedence"
  | "same-level-override"
  | "context-dependent"
  | "agent-defined"
  | "unobservable"
  | "not-parsed";
export type LogicalPath = string;
export type RealPath = string;
export type SourceKind =
  | "native"
  | "shared"
  | "compatibility"
  | "legacy"
  | "implementation"
  | "managed"
  | "bundled";
export type SourceDocUrl = string;

export type CatalogAgent = Agent;
export type CatalogScope = Scope;
export type ResourceVisibility = Visibility;
export type ResourceResolution = Resolution;

export interface CatalogResource {
  agent: Agent;
  scope: Scope;
  role: ResourceRole;
  name: string;
  visibility: Visibility;
  resolution: Resolution;
  logicalPath: LogicalPath;
  realPath: RealPath;
  sourceKind: SourceKind;
  sourceDocUrl: SourceDocUrl;
  note?: string;
}

export interface CatalogNotice {
  code: "unobservable-source" | "configuration-not-parsed" | "trust-not-parsed" | "walker-limit";
  visibility: "unknown";
  sourceKind: SourceKind;
  message: string;
  sourceDocUrl: SourceDocUrl;
}

export interface CatalogResult {
  schemaVersion: 1;
  agent: Agent;
  cwd: LogicalPath;
  projectRoot: LogicalPath;
  resources: CatalogResource[];
  notices: CatalogNotice[];
  limits: {
    maxDepth: number;
    maxDirectories: number;
  };
}

export interface SkillFile {
  path: string;
  kind: Kind;
  source: Source;
  name: string;
  hasDeclaredName?: boolean;
  description: string;
  hasFrontmatter?: boolean;
  frontmatterError?: string;
  alwaysApply: boolean;
  bytes: number;
  mtimeMs: number;
  bodyChars: number;
  bodyLines: number;
  metaTokens: number;
  bodyTokens: number;
  bodyHash: string;
}

export type FindingSeverity = "error" | "warning" | "info";

export type FindingCode =
  | "missing-frontmatter"
  | "invalid-frontmatter"
  | "duplicate-name"
  | "synced-copy"
  | "duplicate-content"
  | "missing-name"
  | "name-too-long"
  | "name-invalid"
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

export type PruneConfidence = "safe" | "optional" | "review";

export type PruneReason =
  | "backup"
  | "nested-copy"
  | "duplicate-name"
  | "duplicate-content"
  | "synced-copy"
  | "oversized"
  | "broken-metadata"
  | "low-score";

export interface PruneDrop {
  file: SkillFile;
  reason: string;
  code: PruneReason;
  confidence: PruneConfidence;
  keepPath?: string;
  deletePath: string;
}

export interface PrunePlan {
  keep: SkillFile[];
  drop: PruneDrop[];
}

export type LinkStatus = "link" | "already-linked" | "conflict";

export interface LinkAction {
  name: string;
  canonicalPath: string;
  canonicalFamily: string;
  linkPath: string;
  linkFamily: string;
  status: LinkStatus;
  reason: string;
}

export interface LinkPlan {
  actions: LinkAction[];
}

export type UpdateStatus = "up-to-date" | "behind" | "ahead" | "dirty" | "no-remote" | "not-git" | "lockfile";

export interface UpdateCheck {
  name: string;
  path: string;
  status: UpdateStatus;
  remote?: string;
  hint?: string;
  manager?: "git" | "adopted";
}

export type SecurityCode =
  | "remote-exec"
  | "eval-remote"
  | "credential"
  | "sensitive-file"
  | "prompt-injection"
  | "exfiltration"
  | "permission-bypass"
  | "destructive"
  | "obfuscation";

export interface SecurityFinding {
  code: SecurityCode;
  severity: FindingSeverity;
  message: string;
  path: string;
  line: number;
  excerpt: string;
}
