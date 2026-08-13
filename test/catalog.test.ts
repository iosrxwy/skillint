import { execFile } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { mapCatalog } from "../src/catalog.js";
import { discover } from "../src/discover.js";
import { formatMap } from "../src/format.js";

const execFileAsync = promisify(execFile);
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function writeSkill(path: string, name: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "SKILL.md"),
    `---
name: ${name}
description: A fixture skill that verifies agent-aware catalog resolution.
---

# ${name}

Follow the fixture workflow.
`,
  );
}

async function catalogFixture(): Promise<{ root: string; repo: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), "skillint-catalog-"));
  const repo = join(root, "repo");
  const home = join(root, "home");
  await mkdir(join(repo, ".git"), { recursive: true });
  await mkdir(home, { recursive: true });
  return { root, repo, home };
}

describe("physical inventory classification", () => {
  it("never promotes files inside a skill package to standalone rules", async () => {
    const root = await mkdtemp(join(tmpdir(), "skillint-support-files-"));
    const skill = join(root, "skills", "demo");
    await writeSkill(skill, "demo");
    for (const relative of [
      "rules/checks.md",
      "prompts/review.md",
      "references/AGENTS.md",
      "references/CLAUDE.md",
      "assets/notes.md",
    ]) {
      const path = join(skill, relative);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "# Support file\n");
    }

    const result = await discover({ extraRoots: [root], global: false, project: false });
    expect(result.files.map((file) => [file.kind, file.name])).toEqual([["skill", "demo"]]);
  });

  it("follows a root-level skill symlink without cycles or nested escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "skillint-safe-walk-"));
    const home = join(root, "home");
    const repo = join(root, "repo");
    const catalog = join(home, ".cursor", "skills");
    const linked = join(root, "linked");
    const escaped = join(root, "escaped");
    await mkdir(catalog, { recursive: true });
    await mkdir(join(repo, ".git"), { recursive: true });
    await writeSkill(linked, "linked");
    await writeSkill(escaped, "escaped");
    await symlink(linked, join(catalog, "linked"));
    await symlink(linked, join(linked, "cycle"));
    await symlink(escaped, join(linked, "escape"));

    const result = await discover({ extraRoots: [catalog], global: false, project: false });
    expect(result.files.map((file) => file.name)).toEqual(["linked"]);
    const mapped = await mapCatalog({ agent: "cursor", cwd: repo, home });
    expect(mapped.resources.filter((item) => item.role === "skill").map((item) => item.name)).toEqual(["linked"]);
  });
});

describe("Cursor catalog adapter", () => {
  it("maps native, shared, compatibility, directory, rule, and instruction sources", async () => {
    const { repo, home } = await catalogFixture();
    await writeSkill(join(home, ".cursor", "skills", "duplicate"), "duplicate");
    await writeSkill(join(home, ".agents", "skills", "shared"), "shared");
    await writeSkill(join(home, ".claude", "skills", "compat"), "compat");
    await writeSkill(join(repo, ".cursor", "skills", "duplicate"), "duplicate");
    await writeSkill(join(repo, "packages", "web", ".cursor", "skills", "web"), "web");
    await mkdir(join(repo, ".cursor", "rules"), { recursive: true });
    await writeFile(join(repo, ".cursor", "rules", "always.mdc"), "---\nalwaysApply: true\n---\nAlways.\n");
    await writeFile(join(repo, ".cursor", "rules", "ignored.md"), "# Not a Cursor rule\n");
    await writeFile(join(repo, "AGENTS.md"), "# Root instructions\n");
    await mkdir(join(repo, "packages", "web"), { recursive: true });
    await writeFile(join(repo, "packages", "web", "AGENTS.md"), "# Web instructions\n");

    const result = await mapCatalog({ agent: "cursor", cwd: repo, home });
    expect(result.schemaVersion).toBe(1);
    expect(result.resources.some((item) => item.sourceKind === "native" && item.scope === "user")).toBe(true);
    expect(result.resources.some((item) => item.sourceKind === "shared")).toBe(true);
    expect(result.resources.some((item) => item.sourceKind === "compatibility")).toBe(true);
    expect(result.resources.some((item) => item.name === "web" && item.scope === "directory")).toBe(true);
    expect(result.resources.some((item) => item.logicalPath.endsWith("ignored.md"))).toBe(false);
    expect(result.resources.find((item) => item.name === "always")?.visibility).toBe("effective");
    expect(
      result.resources
        .filter((item) => item.name === "duplicate")
        .every((item) => item.visibility === "unknown"),
    ).toBe(true);
    expect(result.notices.some((item) => item.visibility === "unknown" && /User Rules/.test(item.message))).toBe(true);
  });
});

describe("Claude Code catalog adapter", () => {
  it("models precedence, qualified directory skills, rules, and CLAUDE.md chains", async () => {
    const { repo, home } = await catalogFixture();
    const web = join(repo, "packages", "web");
    await writeSkill(join(home, ".claude", "skills", "deploy"), "deploy");
    await writeSkill(join(repo, ".claude", "skills", "deploy"), "deploy");
    await writeSkill(join(repo, ".claude", "skills", "verify"), "verify");
    await writeSkill(join(web, ".claude", "skills", "verify"), "verify");
    await writeSkill(join(repo, "packages", "api", ".claude", "skills", "api-only"), "api-only");
    await mkdir(join(home, ".claude", "rules"), { recursive: true });
    await writeFile(join(home, ".claude", "rules", "personal.md"), "# Personal\n");
    await mkdir(join(repo, ".claude", "rules"), { recursive: true });
    await writeFile(join(repo, ".claude", "rules", "base.md"), "# Base\n");
    await writeFile(join(repo, ".claude", "rules", "scoped.md"), "---\npaths:\n  - src/**\n---\nScoped.\n");
    await mkdir(web, { recursive: true });
    await writeFile(join(repo, "CLAUDE.md"), "# Root\n");
    await writeFile(join(web, "CLAUDE.md"), "# Web\n");
    await writeFile(join(web, "CLAUDE.local.md"), "# Local\n");

    const result = await mapCatalog({ agent: "claude", cwd: web, home });
    const deploy = result.resources.filter((item) => item.name === "deploy");
    expect(deploy.find((item) => item.scope === "project")?.visibility).toBe("shadowed");
    expect(deploy.find((item) => item.scope === "user")?.visibility).toBe("conditional");
    expect(
      result.resources.filter((item) => item.name === "verify").every((item) => item.visibility === "coexisting"),
    ).toBe(true);
    expect(result.resources.some((item) => item.name === "api-only")).toBe(false);
    expect(result.resources.find((item) => item.name === "base")?.visibility).toBe("effective");
    expect(result.resources.find((item) => item.name === "scoped")?.visibility).toBe("conditional");
    expect(
      result.resources.filter((item) => item.role === "instruction").every((item) => item.visibility === "effective"),
    ).toBe(true);
    expect(result.notices.some((item) => /managed/.test(item.message))).toBe(true);
  });
});

describe("Codex catalog adapter", () => {
  it("keeps same-name skills coexisting and applies AGENTS override precedence", async () => {
    const { repo, home } = await catalogFixture();
    const service = join(repo, "services", "api");
    await mkdir(service, { recursive: true });
    await writeSkill(join(home, ".agents", "skills", "review"), "review");
    await writeSkill(join(repo, ".agents", "skills", "review"), "review");
    await writeSkill(join(service, ".agents", "skills", "review"), "review");
    await writeSkill(join(home, ".codex", "skills", "legacy"), "legacy");
    await writeFile(join(repo, "AGENTS.md"), "# Shared\n");
    await writeFile(join(repo, "AGENTS.override.md"), "# Override\n");
    await writeFile(join(service, "AGENTS.md"), "# Service\n");

    const result = await mapCatalog({ agent: "codex", cwd: service, home });
    expect(
      result.resources.filter((item) => item.name === "review").every((item) => item.visibility === "coexisting"),
    ).toBe(true);
    expect(
      result.resources.find((item) => item.logicalPath === join(repo, "AGENTS.md"))?.visibility,
    ).toBe("shadowed");
    expect(
      result.resources.find((item) => item.logicalPath === join(repo, "AGENTS.override.md"))?.visibility,
    ).toBe("effective");
    expect(result.resources.find((item) => item.name === "legacy")?.sourceKind).toBe("implementation");
    expect(result.resources.find((item) => item.name === "legacy")?.visibility).toBe("unknown");
    expect(result.notices.some((item) => /fallback/.test(item.message))).toBe(true);
  });
});

describe("map output", () => {
  it("reports explicit catalog walk limits instead of recursing without bounds", async () => {
    const { repo, home } = await catalogFixture();
    await writeSkill(join(repo, "one", "two", ".cursor", "skills", "deep"), "deep");
    const result = await mapCatalog({
      agent: "cursor",
      cwd: repo,
      home,
      maxDepth: 1,
      maxDirectories: 2,
    });
    expect(result.notices.some((item) => item.code === "walker-limit")).toBe(true);
  });

  it("renders honest text and schema-versioned JSON through the CLI", async () => {
    const { repo, home } = await catalogFixture();
    await writeSkill(join(repo, ".agents", "skills", "demo"), "demo");

    const textResult = await mapCatalog({ agent: "codex", cwd: repo, home });
    const text = formatMap(textResult);
    expect(text).toContain("skillint map · codex");
    expect(text).toContain("does not predict model triggering");
    expect(text).toContain("demo");

    const cli = join(projectDir, "node_modules", "tsx", "dist", "cli.mjs");
    const { stdout } = await execFileAsync(process.execPath, [cli, "src/cli.ts", "map", repo, "--agent", "codex", "--json"], {
      cwd: projectDir,
      env: { ...process.env, HOME: home },
    });
    const payload = JSON.parse(stdout) as { schemaVersion: number; agent: string };
    expect(payload.schemaVersion).toBe(1);
    expect(payload.agent).toBe("codex");
  });
});
