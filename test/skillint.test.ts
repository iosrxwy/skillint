import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discover } from "../src/discover.js";
import { doctor, summarizeTokens } from "../src/doctor.js";
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
description: A healthy example skill used in tests.
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

  it("suggests prune without deleting anything", async () => {
    const root = await fixtureRoot();
    const result = await discover({ extraRoots: [root], global: false, project: false });
    const plan = planPrune(result.files, 2);
    expect(plan.keep.length).toBeLessThanOrEqual(2);
    expect(plan.drop.length).toBeGreaterThan(0);
    expect(plan.keep.every((file) => result.files.some((item) => item.path === file.path))).toBe(true);
  });
});
