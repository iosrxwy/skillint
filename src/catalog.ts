import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { open, realpath, stat } from "node:fs/promises";
import { asBoolean, asString, parseFrontmatter } from "./frontmatter.js";
import type {
  Agent,
  CatalogNotice,
  CatalogResource,
  CatalogResult,
  Resolution,
  Scope,
  SourceDocUrl,
  SourceKind,
  Visibility,
} from "./types.js";
import {
  DEFAULT_WALK_MAX_DEPTH,
  DEFAULT_WALK_MAX_DIRECTORIES,
  walkBounded,
  type BoundedWalkResult,
} from "./walk.js";

const DOCS = {
  cursorSkills: "https://cursor.com/docs/skills",
  cursorRules: "https://cursor.com/docs/rules",
  claudeSkills: "https://code.claude.com/docs/en/skills",
  claudeMemory: "https://code.claude.com/docs/en/memory",
  codexSkills: "https://developers.openai.com/codex/skills",
  codexAgents: "https://developers.openai.com/codex/guides/agents-md",
} satisfies Record<string, SourceDocUrl>;

const FRONTMATTER_READ_BYTES = 64 * 1024;

export interface MapCatalogOptions {
  agent: Agent;
  cwd?: string;
  home?: string;
  codexHome?: string;
  adminSkillsRoot?: string;
  maxDepth?: number;
  maxDirectories?: number;
  platform?: NodeJS.Platform;
}

interface ResourceInput {
  scope: Scope;
  role: CatalogResource["role"];
  name: string;
  visibility: Visibility;
  resolution: Resolution;
  logicalPath: string;
  sourceKind: SourceKind;
  sourceDocUrl: SourceDocUrl;
  note?: string;
}

interface SkillRoot {
  path: string;
  scope: Scope;
  sourceKind: SourceKind;
  sourceDocUrl: SourceDocUrl;
  visibility?: Visibility;
  resolution?: Resolution;
  useDirectoryName?: boolean;
  note?: string;
}

function isWithin(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isStrictlyWithin(path: string, root: string): boolean {
  return path !== root && isWithin(path, root);
}

function isRelatedToCwd(directory: string, cwd: string): boolean {
  return isWithin(cwd, directory) || isWithin(directory, cwd);
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => resolve(path)))];
}

async function pathExists(path: string): Promise<boolean> {
  return Boolean(await stat(path).catch(() => null));
}

async function readFrontmatter(path: string): Promise<Record<string, unknown>> {
  const handle = await open(path, "r").catch(() => null);
  if (!handle) return {};
  try {
    const buffer = Buffer.alloc(FRONTMATTER_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return parseFrontmatter(buffer.subarray(0, bytesRead).toString("utf8")).data;
  } finally {
    await handle.close();
  }
}

function hasPaths(data: Record<string, unknown>): boolean {
  const value = data.paths;
  if (typeof value === "string") return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0;
}

function withoutMarkdownExtension(path: string): string {
  return basename(path).replace(/\.(mdc|md)$/i, "");
}

async function findProjectRoot(cwd: string): Promise<string> {
  let current = resolve(cwd);
  const info = await stat(current).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(`Cannot map "${cwd}": expected an existing directory.`);
  }
  while (true) {
    if (await pathExists(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(cwd);
    current = parent;
  }
}

function pathChain(root: string, cwd: string): string[] {
  if (!isWithin(cwd, root)) return [cwd];
  const chain: string[] = [];
  let current = cwd;
  while (true) {
    chain.push(current);
    if (current === root) break;
    current = dirname(current);
  }
  return chain.reverse();
}

function filesystemChain(cwd: string): string[] {
  return pathChain(parse(cwd).root, cwd);
}

function configBase(root: string): string {
  return dirname(dirname(root));
}

function matchingRoots(
  walked: BoundedWalkResult,
  ownerDirectory: ".cursor" | ".claude" | ".codex" | ".agents",
  leaf: "skills" | "rules",
): string[] {
  return walked.directories
    .map((item) => item.logicalPath)
    .filter(
      (path) => basename(path) === leaf && basename(dirname(path)) === ownerDirectory,
    )
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
}

function skillPackageDirectories(walked: BoundedWalkResult): string[] {
  return walked.files
    .filter((item) => basename(item.logicalPath) === "SKILL.md")
    .map((item) => dirname(item.logicalPath));
}

function outsideSkillPackages(path: string, skillDirectories: string[]): boolean {
  return !skillDirectories.some((directory) => isStrictlyWithin(path, directory));
}

class CatalogBuilder {
  readonly agent: Agent;
  readonly cwd: string;
  readonly projectRoot: string;
  readonly maxDepth: number;
  readonly maxDirectories: number;
  readonly resources: CatalogResource[] = [];
  readonly notices: CatalogNotice[] = [];
  private readonly resourceIdentity = new Set<string>();
  private readonly noticeIdentity = new Set<string>();

  constructor(agent: Agent, cwd: string, projectRoot: string, options: MapCatalogOptions) {
    this.agent = agent;
    this.cwd = cwd;
    this.projectRoot = projectRoot;
    this.maxDepth = Math.max(0, options.maxDepth ?? DEFAULT_WALK_MAX_DEPTH);
    this.maxDirectories = Math.max(1, options.maxDirectories ?? DEFAULT_WALK_MAX_DIRECTORIES);
  }

  async walk(path: string, allowExternalRootSymlinks: boolean): Promise<BoundedWalkResult> {
    const walked = await walkBounded(path, {
      maxDepth: this.maxDepth,
      maxDirectories: this.maxDirectories,
      allowExternalRootSymlinks,
    });
    for (const issue of walked.issues) {
      if (issue.kind === "symlink-escape") continue;
      this.addNotice({
        code: "walker-limit",
        visibility: "unknown",
        sourceKind: "native",
        message:
          issue.kind === "depth-limit"
            ? `Catalog walk reached the depth limit at ${issue.path}.`
            : `Catalog walk reached the directory limit at ${issue.path}.`,
        sourceDocUrl: this.agentDocUrl(),
      });
    }
    return walked;
  }

  async addResource(input: ResourceInput): Promise<CatalogResource | null> {
    const logicalPath = resolve(input.logicalPath);
    const info = await stat(logicalPath).catch(() => null);
    if (!info?.isFile()) return null;
    const canonicalPath = await realpath(logicalPath).catch(() => logicalPath);
    const identity = `${input.role}\0${canonicalPath}`;
    if (this.resourceIdentity.has(identity)) return null;
    this.resourceIdentity.add(identity);
    const resource: CatalogResource = {
      agent: this.agent,
      scope: input.scope,
      role: input.role,
      name: input.name,
      visibility: input.visibility,
      resolution: input.resolution,
      logicalPath,
      realPath: canonicalPath,
      sourceKind: input.sourceKind,
      sourceDocUrl: input.sourceDocUrl,
      ...(input.note ? { note: input.note } : {}),
    };
    this.resources.push(resource);
    return resource;
  }

  addNotice(notice: CatalogNotice): void {
    const identity = `${notice.code}\0${notice.message}`;
    if (this.noticeIdentity.has(identity)) return;
    this.noticeIdentity.add(identity);
    this.notices.push(notice);
  }

  finish(): CatalogResult {
    const visibilityOrder: Record<Visibility, number> = {
      effective: 0,
      coexisting: 1,
      conditional: 2,
      shadowed: 3,
      unknown: 4,
    };
    this.resources.sort(
      (a, b) =>
        visibilityOrder[a.visibility] - visibilityOrder[b.visibility] ||
        a.role.localeCompare(b.role) ||
        a.name.localeCompare(b.name) ||
        a.logicalPath.localeCompare(b.logicalPath),
    );
    this.notices.sort((a, b) => a.message.localeCompare(b.message));
    return {
      schemaVersion: 1,
      agent: this.agent,
      cwd: this.cwd,
      projectRoot: this.projectRoot,
      resources: this.resources,
      notices: this.notices,
      limits: {
        maxDepth: this.maxDepth,
        maxDirectories: this.maxDirectories,
      },
    };
  }

  private agentDocUrl(): SourceDocUrl {
    if (this.agent === "cursor") return DOCS.cursorSkills;
    if (this.agent === "claude") return DOCS.claudeSkills;
    return DOCS.codexSkills;
  }
}

async function addSkills(builder: CatalogBuilder, roots: SkillRoot[]): Promise<string[]> {
  const skillDirectories: string[] = [];
  for (const root of roots) {
    const walked = await builder.walk(root.path, true);
    for (const file of walked.files) {
      if (basename(file.logicalPath) !== "SKILL.md") continue;
      const directoryName = basename(dirname(file.logicalPath));
      const data = await readFrontmatter(file.logicalPath);
      const declaredName = asString(data.name);
      const name = root.useDirectoryName ? directoryName : declaredName || directoryName;
      const added = await builder.addResource({
        scope: root.scope,
        role: "skill",
        name,
        visibility: root.visibility ?? "conditional",
        resolution: root.resolution ?? "context-dependent",
        logicalPath: file.logicalPath,
        sourceKind: root.sourceKind,
        sourceDocUrl: root.sourceDocUrl,
        note: root.note,
      });
      if (added) skillDirectories.push(dirname(file.logicalPath));
    }
  }
  return uniquePaths(skillDirectories);
}

function groupsByName(resources: CatalogResource[]): Map<string, CatalogResource[]> {
  const groups = new Map<string, CatalogResource[]>();
  for (const resource of resources) {
    if (resource.role !== "skill") continue;
    const group = groups.get(resource.name) ?? [];
    group.push(resource);
    groups.set(resource.name, group);
  }
  return groups;
}

async function mapCursor(
  builder: CatalogBuilder,
  home: string,
  projectWalk: BoundedWalkResult,
): Promise<void> {
  const projectSkillDirectories = skillPackageDirectories(projectWalk);
  const roots: SkillRoot[] = [
    {
      path: join(home, ".cursor", "skills"),
      scope: "user",
      sourceKind: "native",
      sourceDocUrl: DOCS.cursorSkills,
      useDirectoryName: true,
    },
    {
      path: join(home, ".agents", "skills"),
      scope: "user",
      sourceKind: "shared",
      sourceDocUrl: DOCS.cursorSkills,
      useDirectoryName: true,
    },
    {
      path: join(home, ".claude", "skills"),
      scope: "user",
      sourceKind: "compatibility",
      sourceDocUrl: DOCS.cursorSkills,
      useDirectoryName: true,
    },
    {
      path: join(home, ".codex", "skills"),
      scope: "user",
      sourceKind: "compatibility",
      sourceDocUrl: DOCS.cursorSkills,
      useDirectoryName: true,
    },
  ];

  for (const [owner, sourceKind] of [
    [".cursor", "native"],
    [".agents", "shared"],
    [".claude", "compatibility"],
    [".codex", "compatibility"],
  ] as const) {
    for (const path of matchingRoots(projectWalk, owner, "skills")) {
      if (!outsideSkillPackages(path, projectSkillDirectories)) continue;
      roots.push({
        path,
        scope: configBase(path) === builder.projectRoot ? "project" : "directory",
        sourceKind,
        sourceDocUrl: DOCS.cursorSkills,
        useDirectoryName: true,
      });
    }
  }
  await addSkills(builder, roots);

  const cursorRules = join(builder.projectRoot, ".cursor", "rules");
  const ruleWalk = await builder.walk(cursorRules, false);
  for (const file of ruleWalk.files) {
    if (!file.logicalPath.endsWith(".mdc")) continue;
    const data = await readFrontmatter(file.logicalPath);
    const always = asBoolean(data.alwaysApply) || asBoolean(data["always-apply"]);
    await builder.addResource({
      scope: "project",
      role: "rule",
      name: withoutMarkdownExtension(file.logicalPath),
      visibility: always ? "effective" : "conditional",
      resolution: always ? "direct" : "context-dependent",
      logicalPath: file.logicalPath,
      sourceKind: "native",
      sourceDocUrl: DOCS.cursorRules,
      note: always
        ? "Always-applied project rule."
        : "Application depends on globs, description relevance, or explicit mention.",
    });
  }

  for (const file of projectWalk.files) {
    if (basename(file.logicalPath) !== "AGENTS.md") continue;
    if (!outsideSkillPackages(file.logicalPath, projectSkillDirectories)) continue;
    const directory = dirname(file.logicalPath);
    const appliesAtCwd = isWithin(builder.cwd, directory);
    await builder.addResource({
      scope: directory === builder.projectRoot ? "project" : "directory",
      role: "instruction",
      name: "AGENTS",
      visibility: appliesAtCwd ? "effective" : "conditional",
      resolution: appliesAtCwd ? "instruction-chain" : "context-dependent",
      logicalPath: file.logicalPath,
      sourceKind: "native",
      sourceDocUrl: DOCS.cursorRules,
      note: appliesAtCwd
        ? "Included in the current directory instruction chain."
        : "Applies only when work enters this directory.",
    });
  }

  for (const group of groupsByName(builder.resources).values()) {
    if (group.length < 2) continue;
    for (const resource of group) {
      resource.visibility = "unknown";
      resource.resolution = "agent-defined";
      resource.note = "Cursor does not document same-name precedence across these skill roots.";
    }
  }

  builder.addNotice({
    code: "unobservable-source",
    visibility: "unknown",
    sourceKind: "managed",
    message: "Cursor User Rules and Team Rules are managed in Cursor UI/dashboard and are not fabricated as local files.",
    sourceDocUrl: DOCS.cursorRules,
  });
  builder.addNotice({
    code: "unobservable-source",
    visibility: "unknown",
    sourceKind: "bundled",
    message: "Cursor built-in skills are bundled by Cursor and are not represented as guessed filesystem resources.",
    sourceDocUrl: DOCS.cursorSkills,
  });
}

async function addClaudeRules(
  builder: CatalogBuilder,
  root: string,
  scope: Scope,
  sourceKind: SourceKind,
): Promise<void> {
  const walked = await builder.walk(root, true);
  for (const file of walked.files) {
    if (!file.logicalPath.endsWith(".md")) continue;
    const data = await readFrontmatter(file.logicalPath);
    const conditional = scope === "directory" || hasPaths(data);
    await builder.addResource({
      scope,
      role: "rule",
      name: withoutMarkdownExtension(file.logicalPath),
      visibility: conditional ? "conditional" : "effective",
      resolution: conditional ? "context-dependent" : "direct",
      logicalPath: file.logicalPath,
      sourceKind,
      sourceDocUrl: DOCS.claudeMemory,
      note: conditional
        ? "Loads when directory/file-path context matches."
        : "Unscoped rule loaded into the default instruction context.",
    });
  }
}

async function mapClaude(
  builder: CatalogBuilder,
  home: string,
  projectWalk: BoundedWalkResult,
  platform: NodeJS.Platform,
): Promise<void> {
  const projectSkillDirectories = skillPackageDirectories(projectWalk);
  const roots: SkillRoot[] = [
    {
      path: join(home, ".claude", "skills"),
      scope: "user",
      sourceKind: "native",
      sourceDocUrl: DOCS.claudeSkills,
      useDirectoryName: true,
    },
  ];
  for (const path of matchingRoots(projectWalk, ".claude", "skills")) {
    if (!outsideSkillPackages(path, projectSkillDirectories)) continue;
    if (!isRelatedToCwd(configBase(path), builder.cwd)) continue;
    roots.push({
      path,
      scope: configBase(path) === builder.projectRoot ? "project" : "directory",
      sourceKind: "native",
      sourceDocUrl: DOCS.claudeSkills,
      useDirectoryName: true,
    });
  }
  await addSkills(builder, roots);

  await addClaudeRules(builder, join(home, ".claude", "rules"), "user", "native");
  for (const path of matchingRoots(projectWalk, ".claude", "rules")) {
    if (!outsideSkillPackages(path, projectSkillDirectories)) continue;
    if (!isRelatedToCwd(configBase(path), builder.cwd)) continue;
    await addClaudeRules(
      builder,
      path,
      configBase(path) === builder.projectRoot ? "project" : "directory",
      "native",
    );
  }

  const managedPath =
    platform === "darwin"
      ? "/Library/Application Support/ClaudeCode/CLAUDE.md"
      : platform === "win32"
        ? "C:\\Program Files\\ClaudeCode\\CLAUDE.md"
        : "/etc/claude-code/CLAUDE.md";
  await builder.addResource({
    scope: "managed",
    role: "instruction",
    name: "CLAUDE",
    visibility: "effective",
    resolution: "instruction-chain",
    logicalPath: managedPath,
    sourceKind: "managed",
    sourceDocUrl: DOCS.claudeMemory,
    note: "Managed policy instructions load before user and project instructions.",
  });
  await builder.addResource({
    scope: "user",
    role: "instruction",
    name: "CLAUDE",
    visibility: "effective",
    resolution: "instruction-chain",
    logicalPath: join(home, ".claude", "CLAUDE.md"),
    sourceKind: "native",
    sourceDocUrl: DOCS.claudeMemory,
  });

  const instructionCandidates = new Set<string>();
  for (const directory of filesystemChain(builder.cwd)) {
    instructionCandidates.add(join(directory, "CLAUDE.md"));
    instructionCandidates.add(join(directory, "CLAUDE.local.md"));
  }
  instructionCandidates.add(join(builder.projectRoot, ".claude", "CLAUDE.md"));
  for (const file of projectWalk.files) {
    const name = basename(file.logicalPath);
    if (name === "CLAUDE.md" || name === "CLAUDE.local.md") {
      instructionCandidates.add(file.logicalPath);
    }
  }

  for (const path of instructionCandidates) {
    if (!outsideSkillPackages(path, projectSkillDirectories)) continue;
    const directory =
      path === join(builder.projectRoot, ".claude", "CLAUDE.md")
        ? builder.projectRoot
        : dirname(path);
    if (!isRelatedToCwd(directory, builder.cwd)) continue;
    const appliesAtCwd = isWithin(builder.cwd, directory);
    await builder.addResource({
      scope: directory === builder.projectRoot ? "project" : "directory",
      role: "instruction",
      name: withoutMarkdownExtension(path),
      visibility: appliesAtCwd ? "effective" : "conditional",
      resolution: appliesAtCwd ? "instruction-chain" : "context-dependent",
      logicalPath: path,
      sourceKind: "native",
      sourceDocUrl: DOCS.claudeMemory,
      note: appliesAtCwd
        ? "Concatenated broad-to-specific; CLAUDE.local.md follows CLAUDE.md at the same level."
        : "Loaded on demand when Claude reads files in this subdirectory.",
    });
  }

  for (const group of groupsByName(builder.resources).values()) {
    if (group.length < 2) continue;
    const hasDirectoryVariant = group.some((resource) => resource.scope === "directory");
    if (hasDirectoryVariant) {
      for (const resource of group) {
        resource.visibility = "coexisting";
        resource.resolution = "same-name-coexists";
        resource.note = "Nested Claude skills remain available under directory-qualified names.";
      }
      continue;
    }
    const user = group.find((resource) => resource.scope === "user");
    if (!user) {
      for (const resource of group) {
        resource.visibility = "unknown";
        resource.resolution = "agent-defined";
      }
      continue;
    }
    user.visibility = "conditional";
    user.resolution = "higher-precedence";
    user.note = "Personal skills take precedence over project skills with the same command name.";
    for (const resource of group) {
      if (resource === user) continue;
      resource.visibility = "shadowed";
      resource.resolution = "higher-precedence";
      resource.note = `Shadowed by ${user.logicalPath}.`;
    }
  }

  builder.addNotice({
    code: "unobservable-source",
    visibility: "unknown",
    sourceKind: "managed",
    message: "Enterprise managed skills and managed-settings claudeMd content are not observable from the documented local skill roots.",
    sourceDocUrl: DOCS.claudeSkills,
  });
  builder.addNotice({
    code: "unobservable-source",
    visibility: "unknown",
    sourceKind: "bundled",
    message: "Bundled, plugin, and cloud-only Claude skills are not enumerated unless they are materialized under an observed local root.",
    sourceDocUrl: DOCS.claudeSkills,
  });
  builder.addNotice({
    code: "configuration-not-parsed",
    visibility: "unknown",
    sourceKind: "native",
    message: "Claude setting-sources and claudeMdExcludes are not parsed; map reports default documented discovery.",
    sourceDocUrl: DOCS.claudeMemory,
  });
  builder.addNotice({
    code: "trust-not-parsed",
    visibility: "unknown",
    sourceKind: "native",
    message: "Workspace trust and allowed-tools enforcement are not inferred from the catalog.",
    sourceDocUrl: DOCS.claudeSkills,
  });
}

async function addAgentsLevel(
  builder: CatalogBuilder,
  directory: string,
  scope: Scope,
  sourceKind: SourceKind,
  skillDirectories: string[],
): Promise<void> {
  const overridePath = join(directory, "AGENTS.override.md");
  const regularPath = join(directory, "AGENTS.md");
  const overrideExists =
    outsideSkillPackages(overridePath, skillDirectories) && (await pathExists(overridePath));
  const regularExists =
    outsideSkillPackages(regularPath, skillDirectories) && (await pathExists(regularPath));

  if (overrideExists) {
    await builder.addResource({
      scope,
      role: "instruction",
      name: "AGENTS.override",
      visibility: "effective",
      resolution: "same-level-override",
      logicalPath: overridePath,
      sourceKind,
      sourceDocUrl: DOCS.codexAgents,
      note: "Selected instead of AGENTS.md at this directory level.",
    });
  }
  if (regularExists) {
    await builder.addResource({
      scope,
      role: "instruction",
      name: "AGENTS",
      visibility: overrideExists ? "shadowed" : "effective",
      resolution: overrideExists ? "same-level-override" : "instruction-chain",
      logicalPath: regularPath,
      sourceKind,
      sourceDocUrl: DOCS.codexAgents,
      note: overrideExists
        ? "Not selected because AGENTS.override.md exists at the same level."
        : "Included in the root-to-cwd instruction chain.",
    });
  }
}

async function mapCodex(
  builder: CatalogBuilder,
  home: string,
  codexHome: string,
  adminSkillsRoot: string,
): Promise<void> {
  const chain = pathChain(builder.projectRoot, builder.cwd);
  const nativeRoots: SkillRoot[] = [
    {
      path: join(home, ".agents", "skills"),
      scope: "user",
      sourceKind: "native",
      sourceDocUrl: DOCS.codexSkills,
    },
    {
      path: adminSkillsRoot,
      scope: "admin",
      sourceKind: "native",
      sourceDocUrl: DOCS.codexSkills,
    },
  ];
  for (const directory of chain) {
    nativeRoots.push({
      path: join(directory, ".agents", "skills"),
      scope: directory === builder.projectRoot ? "project" : "directory",
      sourceKind: "native",
      sourceDocUrl: DOCS.codexSkills,
    });
  }
  const skillDirectories = await addSkills(builder, nativeRoots);

  const implementationRoots: SkillRoot[] = [
    {
      path: join(codexHome, "skills"),
      scope: "user",
      sourceKind: "implementation",
      sourceDocUrl: DOCS.codexSkills,
      visibility: "unknown",
      resolution: "not-parsed",
      note: "Implementation/legacy root; not listed as a current authoring scope in the official catalog table.",
    },
  ];
  for (const directory of chain) {
    implementationRoots.push({
      path: join(directory, ".codex", "skills"),
      scope: directory === builder.projectRoot ? "project" : "directory",
      sourceKind: "legacy",
      sourceDocUrl: DOCS.codexSkills,
      visibility: "unknown",
      resolution: "not-parsed",
      note: "Legacy project root; current Codex documentation specifies .agents/skills.",
    });
  }
  skillDirectories.push(...(await addSkills(builder, implementationRoots)));

  for (const group of groupsByName(builder.resources).values()) {
    const native = group.filter((resource) => resource.sourceKind === "native");
    if (native.length < 2) continue;
    for (const resource of native) {
      resource.visibility = "coexisting";
      resource.resolution = "same-name-coexists";
      resource.note = "Codex keeps same-name skills as distinct selector entries.";
    }
  }

  await addAgentsLevel(builder, codexHome, "user", "native", skillDirectories);
  for (const directory of chain) {
    await addAgentsLevel(
      builder,
      directory,
      directory === builder.projectRoot ? "project" : "directory",
      "native",
      skillDirectories,
    );
  }

  builder.addNotice({
    code: "unobservable-source",
    visibility: "unknown",
    sourceKind: "bundled",
    message: "Codex system skills bundled with the installation are unobservable from repository and user roots.",
    sourceDocUrl: DOCS.codexSkills,
  });
  builder.addNotice({
    code: "configuration-not-parsed",
    visibility: "unknown",
    sourceKind: "native",
    message: "Codex project_doc_fallback_filenames, project-root markers, and instruction byte limits are not parsed; fallback instruction files remain unknown.",
    sourceDocUrl: DOCS.codexAgents,
  });
  builder.addNotice({
    code: "trust-not-parsed",
    visibility: "unknown",
    sourceKind: "native",
    message: "Codex trust and config-layer behavior are not inferred by map.",
    sourceDocUrl: DOCS.codexAgents,
  });
}

export async function mapCatalog(options: MapCatalogOptions): Promise<CatalogResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const home = resolve(options.home ?? homedir());
  const projectRoot = await findProjectRoot(cwd);
  const builder = new CatalogBuilder(options.agent, cwd, projectRoot, options);
  const projectWalk = await builder.walk(projectRoot, false);

  if (options.agent === "cursor") {
    await mapCursor(builder, home, projectWalk);
  } else if (options.agent === "claude") {
    await mapClaude(builder, home, projectWalk, options.platform ?? process.platform);
  } else {
    const codexHome = resolve(
      options.codexHome ??
        (options.home == null && process.env.CODEX_HOME
          ? process.env.CODEX_HOME
          : join(home, ".codex")),
    );
    await mapCodex(
      builder,
      home,
      codexHome,
      resolve(options.adminSkillsRoot ?? "/etc/codex/skills"),
    );
  }

  return builder.finish();
}
