import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatGithubAnnotations } from "../src/annotate.js";
import { loadConfig } from "../src/config.js";
import { discover } from "../src/discover.js";
import { doctor, healthScore, summarizeTokens } from "../src/doctor.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { scaffoldSkill } from "../src/init.js";
import { parseFailLevel, parseInteger } from "../src/options.js";
import { planPrune } from "../src/prune.js";
import type { SkillFile } from "../src/types.js";

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "skillint-"));
  await mkdir(join(root, "dup-a"), { recursive: true });
  await mkdir(join(root, "dup-b"), { recursive: true });
  await mkdir(join(root, "ok-skill"), { recursive: true });
  await mkdir(join(root, "empty-skill"), { recursive: true });

  await writeFile(
    join(root, "ok-skill", "SKILL.md"),
    `---
name: ok-skill
description: A healthy example skill used in unit tests for skillint.
---

# OK

Do the thing.
`,
  );

  await writeFile(
    join(root, "dup-a", "SKILL.md"),
    `---
name: shared-name
description: First copy of a duplicated skill.
---

Body A
`,
  );

  await writeFile(
    join(root, "dup-b", "SKILL.md"),
    `---
name: shared-name
description: Second copy of a duplicated skill.
---

Body B
`,
  );

  await writeFile(
    join(root, "empty-skill", "SKILL.md"),
    `---
name: empty-skill
---
`,
  );

  await writeFile(
    join(root, "AGENTS.md"),
    `# Agents

Keep the repo tidy.
`,
  );

  return root;
}

describe("parseFrontmatter", () => {
  it("reads folded descriptions", () => {
    const parsed = parseFrontmatter(`---
name: demo
description: >-
  Line one
  line two
---

Body
`);
    expect(parsed.data.name).toBe("demo");
    expect(String(parsed.data.description)).toContain("Line one");
    expect(parsed.body.trim()).toBe("Body");
  });

  it("returns the whole file when frontmatter is missing", () => {
    const parsed = parseFrontmatter("# just markdown\n");
    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.error).toBe("");
    expect(parsed.data).toEqual({});
    expect(parsed.body).toContain("just markdown");
  });

  it("reports malformed and unclosed frontmatter", () => {
    const malformed = parseFrontmatter("---\nname: [broken\n---\nBody\n");
    expect(malformed.hasFrontmatter).toBe(true);
    expect(malformed.error).not.toBe("");

    const unclosed = parseFrontmatter("---\nname: demo\nBody\n");
    expect(unclosed.hasFrontmatter).toBe(true);
    expect(unclosed.error).toContain("closing");
  });

  it("accepts a UTF-8 BOM before frontmatter", () => {
    const parsed = parseFrontmatter("\uFEFF---\nname: demo\n---\nBody\n");
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.error).toBe("");
    expect(parsed.data.name).toBe("demo");
  });
});

describe("discover / doctor / prune", () => {
  it("scans skills and reports duplicates and missing descriptions", async () => {
    const root = await fixtureRoot();
    const result = await discover({
      extraRoots: [root],
      global: false,
      project: false,
    });

    expect(result.files.some((file) => file.name === "ok-skill")).toBe(true);
    expect(result.files.some((file) => file.name === "AGENTS")).toBe(true);

    const findings = doctor(result.files);
    expect(findings.some((item) => item.code === "duplicate-name")).toBe(true);
    expect(findings.some((item) => item.code === "missing-description" && item.path.includes("empty-skill"))).toBe(true);
    expect(findings.some((item) => item.code === "missing-description" && item.path.endsWith("AGENTS.md"))).toBe(false);

    const summary = summarizeTokens(result.files);
    expect(summary.skills).toBe(4);
    expect(summary.rules).toBe(1);
    expect(summary.metaTokens).toBeGreaterThan(0);
  });

  it("ignores matching paths", async () => {
    const root = await fixtureRoot();
    const result = await discover({
      extraRoots: [root],
      global: false,
      project: false,
      ignore: ["empty-skill"],
    });
    expect(result.files.some((file) => file.path.includes("empty-skill"))).toBe(false);
    expect(result.files.some((file) => file.name === "ok-skill")).toBe(true);
  });

  it("flags first-person skill descriptions", async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, "voice"), { recursive: true });
    await writeFile(
      join(root, "voice", "SKILL.md"),
      `---
name: voice
description: I can help you write better commit messages when you ask.
---

Body
`,
    );
    const result = await discover({ extraRoots: [root], global: false, project: false });
    const findings = doctor(result.files);
    expect(findings.some((item) => item.code === "description-first-person")).toBe(true);
  });

  it("groups duplicate names into a single finding", async () => {
    const root = await fixtureRoot();
    const result = await discover({ extraRoots: [root], global: false, project: false });
    const dupes = doctor(result.files).filter((item) => item.code === "duplicate-name");
    expect(dupes).toHaveLength(1);
    const health = healthScore(result.files, doctor(result.files));
    expect(health.score).toBeLessThan(100);
  });

  it("suggests prune without deleting anything", async () => {
    const root = await fixtureRoot();
    const result = await discover({ extraRoots: [root], global: false, project: false });
    const plan = planPrune(result.files, 2);
    expect(plan.keep.length).toBeLessThanOrEqual(2);
    expect(plan.drop.length).toBeGreaterThan(0);
    expect(plan.keep.every((file) => result.files.some((item) => item.path === file.path))).toBe(true);
  });

  it("names safe delete targets for backups and nested copies", async () => {
    const root = await mkdtemp(join(tmpdir(), "skillint-prune-"));
    const keep = join(root, "skills", "code-review");
    const nested = join(root, "skills", "router", "code-review");
    const backup = join(root, "skills", "code-review.bak-20260101");
    await mkdir(keep, { recursive: true });
    await mkdir(nested, { recursive: true });
    await mkdir(backup, { recursive: true });
    const body = `---
name: code-review
description: Review a pull request and leave specific comments.
---

Review the diff.
`;
    await writeFile(join(keep, "SKILL.md"), body);
    await writeFile(join(nested, "SKILL.md"), body);
    await writeFile(join(backup, "SKILL.md"), body);

    const result = await discover({ extraRoots: [root], global: false, project: false });
    const plan = planPrune(result.files);
    const safe = plan.drop.filter((item) => item.confidence === "safe");
    expect(safe.some((item) => item.code === "backup" && item.deletePath === backup)).toBe(true);
    expect(safe.some((item) => item.code === "nested-copy" && item.deletePath === nested)).toBe(true);
    expect(plan.keep.some((file) => file.path === join(keep, "SKILL.md"))).toBe(true);
    expect(plan.drop.every((item) => item.deletePath !== keep)).toBe(true);
  });

  it("does not treat unique healthy skills as safe deletions", async () => {
    const root = await fixtureRoot();
    const result = await discover({ extraRoots: [root], global: false, project: false });
    const plan = planPrune(result.files);
    const ok = result.files.find((file) => file.name === "ok-skill");
    expect(ok).toBeTruthy();
    expect(plan.keep.some((file) => file.path === ok?.path)).toBe(true);
    expect(plan.drop.filter((item) => item.confidence === "safe").every((item) => item.file.name !== "ok-skill")).toBe(
      true,
    );
  });

  it("discovers Grok, Gemini, and Copilot skill folders", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-home-"));
    const grokDir = join(home, ".grok", "skills", "grok-demo");
    const geminiDir = join(home, ".gemini", "skills", "gemini-demo");
    const copilotDir = join(home, ".copilot", "skills", "copilot-demo");
    await mkdir(grokDir, { recursive: true });
    await mkdir(geminiDir, { recursive: true });
    await mkdir(copilotDir, { recursive: true });
    const body = `---
name: demo-skill
description: A portable agent skill used to verify extra discovery roots.
---

Body
`;
    await writeFile(join(grokDir, "SKILL.md"), body.replace("demo-skill", "grok-demo"));
    await writeFile(join(geminiDir, "SKILL.md"), body.replace("demo-skill", "gemini-demo"));
    await writeFile(join(copilotDir, "SKILL.md"), body.replace("demo-skill", "copilot-demo"));

    const result = await discover({ home, cwd: home, global: true, project: false });
    expect(result.files.some((file) => file.source === "grok-global" && file.name === "grok-demo")).toBe(true);
    expect(result.files.some((file) => file.source === "gemini-global" && file.name === "gemini-demo")).toBe(true);
    expect(result.files.some((file) => file.source === "copilot-global" && file.name === "copilot-demo")).toBe(true);
  });

  it("follows Grok skill directory symlinks", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-symlink-"));
    const realDir = join(home, ".agents", "skills", "linked-skill");
    const grokLink = join(home, ".grok", "skills", "linked-skill");
    await mkdir(realDir, { recursive: true });
    await mkdir(join(home, ".grok", "skills"), { recursive: true });
    await writeFile(
      join(realDir, "SKILL.md"),
      `---
name: linked-skill
description: A skill reached through a Grok directory symlink for discovery tests.
---

Body
`,
    );
    await symlink(realDir, grokLink);

    const result = await discover({ home, cwd: home, global: true, project: false });
    expect(result.files.some((file) => file.source === "grok-global" && file.name === "linked-skill")).toBe(true);
  });

  it("treats the same skill in two agent catalogs as a synced copy, not an error", () => {
    const files: SkillFile[] = [
      {
        path: "/cursor/demo/SKILL.md",
        kind: "skill",
        source: "cursor-global",
        name: "demo",
        description: "A portable agent skill used to verify cross-catalog copies.",
        alwaysApply: false,
        bytes: 120,
        mtimeMs: 1,
        bodyChars: 20,
        bodyLines: 8,
        metaTokens: 12,
        bodyTokens: 20,
        bodyHash: "aaaa",
      },
      {
        path: "/claude/demo/SKILL.md",
        kind: "skill",
        source: "claude-global",
        name: "demo",
        description: "A portable agent skill used to verify cross-catalog copies.",
        alwaysApply: false,
        bytes: 120,
        mtimeMs: 1,
        bodyChars: 20,
        bodyLines: 8,
        metaTokens: 12,
        bodyTokens: 20,
        bodyHash: "aaaa",
      },
    ];
    const findings = doctor(files);
    expect(findings.some((item) => item.code === "duplicate-name")).toBe(false);
    expect(findings.some((item) => item.code === "synced-copy")).toBe(true);
    expect(healthScore(files, findings).score).toBe(100);
  });

  it("flags identical bodies stored under different names in the same catalog", () => {
    const files: SkillFile[] = [
      {
        path: "/custom/one/SKILL.md",
        kind: "skill",
        source: "custom",
        name: "one",
        description: "A portable agent skill used to verify duplicate content detection.",
        alwaysApply: false,
        bytes: 120,
        mtimeMs: 1,
        bodyChars: 20,
        bodyLines: 8,
        metaTokens: 12,
        bodyTokens: 20,
        bodyHash: "bbbb",
      },
      {
        path: "/custom/two/SKILL.md",
        kind: "skill",
        source: "custom",
        name: "two",
        description: "A portable agent skill used to verify duplicate content detection.",
        alwaysApply: false,
        bytes: 120,
        mtimeMs: 1,
        bodyChars: 20,
        bodyLines: 8,
        metaTokens: 12,
        bodyTokens: 20,
        bodyHash: "bbbb",
      },
    ];
    expect(doctor(files).some((item) => item.code === "duplicate-content")).toBe(true);
  });

  it("flags skill names that break the spec format", async () => {
    const root = await mkdtemp(join(tmpdir(), "skillint-names-"));
    await mkdir(join(root, "Bad_Name"), { recursive: true });
    await writeFile(
      join(root, "Bad_Name", "SKILL.md"),
      `---
name: Bad_Name
description: A skill whose name uses uppercase and underscores against the spec.
---

Body
`,
    );
    const result = await discover({ extraRoots: [root], global: false, project: false });
    const findings = doctor(result.files);
    expect(findings.some((item) => item.code === "name-invalid")).toBe(true);
  });

  it("honors custom limits from config overrides", async () => {
    const root = await fixtureRoot();
    const result = await discover({ extraRoots: [root], global: false, project: false });
    const strict = doctor(result.files, { skillBodyTokens: 1 });
    expect(strict.some((item) => item.code === "oversized")).toBe(true);
  });

  it("distinguishes missing frontmatter from a missing declared name", async () => {
    const root = await mkdtemp(join(tmpdir(), "skillint-metadata-"));
    await mkdir(join(root, "plain"), { recursive: true });
    await mkdir(join(root, "unnamed"), { recursive: true });
    await writeFile(join(root, "plain", "SKILL.md"), "# Plain\n\nBody\n");
    await writeFile(
      join(root, "unnamed", "SKILL.md"),
      `---
description: A valid description whose frontmatter forgot the required name field.
---

Body
`,
    );

    const result = await discover({ extraRoots: [root], global: false, project: false });
    const findings = doctor(result.files);
    expect(findings.some((item) => item.code === "missing-frontmatter" && item.path.includes("plain"))).toBe(true);
    expect(findings.some((item) => item.code === "missing-name" && item.path.includes("unnamed"))).toBe(true);
  });

  it("surfaces invalid YAML frontmatter as a specific error", async () => {
    const root = await mkdtemp(join(tmpdir(), "skillint-invalid-yaml-"));
    await mkdir(join(root, "broken"), { recursive: true });
    await writeFile(join(root, "broken", "SKILL.md"), "---\nname: [broken\n---\nBody\n");
    const result = await discover({ extraRoots: [root], global: false, project: false });
    const findings = doctor(result.files);
    expect(findings.filter((item) => item.code === "invalid-frontmatter")).toHaveLength(1);
    expect(findings.some((item) => item.code === "missing-description")).toBe(false);
  });

  it("does not hash truncated files for duplicate-content checks", async () => {
    const root = await mkdtemp(join(tmpdir(), "skillint-large-"));
    await mkdir(join(root, "large"), { recursive: true });
    const prefix = `---
name: large
description: A deliberately large skill used to verify bounded reads without false duplicate hashes.
---

`;
    await writeFile(join(root, "large", "SKILL.md"), `${prefix}${"x".repeat(600_000)}`);
    const result = await discover({ extraRoots: [root], global: false, project: false });
    expect(result.files[0]?.bodyHash).toBe("");
    expect(result.files[0]?.bodyTokens).toBeGreaterThan(100_000);
  });
});

describe("init", () => {
  it("scaffolds a skill that passes doctor with zero findings", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "skillint-init-"));
    const { path } = await scaffoldSkill({ name: "code-review", cwd });
    expect(path.endsWith(join("skills", "code-review", "SKILL.md"))).toBe(true);

    const result = await discover({ extraRoots: [join(cwd, "skills")], global: false, project: false });
    expect(result.files).toHaveLength(1);
    expect(doctor(result.files)).toHaveLength(0);
  });

  it("rejects invalid names and refuses to overwrite", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "skillint-init-"));
    await expect(scaffoldSkill({ name: "Bad Name", cwd })).rejects.toThrow(/lowercase/);
    await scaffoldSkill({ name: "demo", cwd });
    await expect(scaffoldSkill({ name: "demo", cwd })).rejects.toThrow(/already exists/);
  });
});

describe("config", () => {
  it("returns empty config when the file is missing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "skillint-config-"));
    expect(await loadConfig(cwd)).toEqual({});
  });

  it("parses ignore patterns and limits", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "skillint-config-"));
    await writeFile(
      join(cwd, "skillint.config.json"),
      JSON.stringify({ ignore: ["vendor"], limits: { skillBodyTokens: 2000 } }),
    );
    const config = await loadConfig(cwd);
    expect(config.ignore).toEqual(["vendor"]);
    expect(config.limits).toEqual({ skillBodyTokens: 2000 });
  });

  it("rejects malformed config with a clear error", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "skillint-config-"));
    await writeFile(join(cwd, "skillint.config.json"), '{"limits": {"skillBodyTokens": "big"}}');
    await expect(loadConfig(cwd)).rejects.toThrow(/skillBodyTokens/);
  });

  it("rejects misspelled config keys instead of silently ignoring them", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "skillint-config-"));
    await writeFile(join(cwd, "skillint.config.json"), '{"limits": {"skillBodyToken": 10}}');
    await expect(loadConfig(cwd)).rejects.toThrow(/unknown limit/);
  });
});

describe("CLI option validation", () => {
  it("accepts documented fail levels and numeric ranges", () => {
    expect(parseFailLevel("none")).toBe("none");
    expect(parseInteger("80", "--fail-under", { min: 0, max: 100 })).toBe(80);
  });

  it("rejects typos and out-of-range values", () => {
    expect(() => parseFailLevel("warnings")).toThrow(/Expected error, warning, or none/);
    expect(() => parseInteger("101", "--fail-under", { min: 0, max: 100 })).toThrow(/0-100/);
    expect(() => parseInteger("2.5", "--keep", { min: 0 })).toThrow(/integer/);
  });
});

describe("format", () => {
  it("renders a health bar that fills with the score", async () => {
    const { healthBar, formatGithubSummary } = await import("../src/format.js");
    expect(healthBar(0, 10)).toContain("░");
    expect(healthBar(100, 10)).toContain("█");
    const summary = formatGithubSummary({
      command: "scan",
      health: { score: 72, label: "fair" },
      summary: {
        files: 4,
        skills: 3,
        rules: 1,
        metaTokens: 10,
        bodyTokens: 20,
        alwaysOnTokens: 0,
        bySource: {},
      },
    });
    expect(summary).toContain("skillint scan");
    expect(summary).toContain("72/100");
  });

  it("emits GitHub workflow annotations for errors and warnings", () => {
    const text = formatGithubAnnotations(
      [
        {
          code: "missing-name",
          severity: "error",
          message: "Skill is missing a name",
          path: "/repo/skills/broken/SKILL.md",
        },
        {
          code: "synced-copy",
          severity: "info",
          message: "Name demo is installed in 2 agent catalogs",
          path: "/repo/skills/demo/SKILL.md",
        },
      ],
      "/repo",
    );
    expect(text).toContain("::error file=skills/broken/SKILL.md,title=missing-name::Skill is missing a name");
    expect(text).not.toContain("synced-copy");
  });
});

describe("report", () => {
  it("renders a markdown audit", async () => {
    const { formatReport } = await import("../src/report.js");
    const root = await fixtureRoot();
    const result = await discover({ extraRoots: [root], global: false, project: false });
    const markdown = formatReport({
      generatedAt: "2026-08-13T00:00:00.000Z",
      result,
      summary: summarizeTokens(result.files),
      findings: doctor(result.files),
    });
    expect(markdown).toContain("# skillint report");
    expect(markdown).toContain("## Findings");
    expect(markdown).toContain("## Cleanup plan");
    expect(markdown).toContain("duplicate-name");
    expect(markdown).toContain("Related paths");
  });
});
