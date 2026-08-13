import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discover } from "../src/discover.js";
import { doctor, healthScore, summarizeTokens } from "../src/doctor.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { planPrune } from "../src/prune.js";

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
    expect(parsed.data).toEqual({});
    expect(parsed.body).toContain("just markdown");
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
    expect(markdown).toContain("duplicate-name");
  });
});
