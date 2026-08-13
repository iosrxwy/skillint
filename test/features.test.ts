import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderBadge } from "../src/badge.js";
import { discover } from "../src/discover.js";
import { applyFix, draftDescription, planFix, sanitizeName } from "../src/fix.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { formatHtmlReport } from "../src/html.js";
import { adoptSkills, applyAdopted, checkAdopted, collectRegistrySkills, readSources, registryRoot } from "../src/registry.js";
import { doctor, healthScore, summarizeTokens } from "../src/doctor.js";
import { planPrune } from "../src/prune.js";

const SHARED_BODY = `# Review

Review the diff and leave specific comments on every risky change.
`;

function skillMd(name: string, body = SHARED_BODY): string {
  return `---
name: ${name}
description: Review pull requests and leave specific actionable comments.
---

${body}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("adopt and registry updates", () => {
  it("adopts orphans by content hash and batch-updates them, undoably", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-adopt-"));
    const repo = "acme/skills";
    const registrySkillDir = join(registryRoot(home), repo.replace(/\//g, "__"), "skills", "code-review");
    await mkdir(registrySkillDir, { recursive: true });
    await writeFile(join(registrySkillDir, "SKILL.md"), skillMd("code-review"));

    const installed = join(home, ".cursor", "skills", "code-review");
    await mkdir(installed, { recursive: true });
    await writeFile(join(installed, "SKILL.md"), skillMd("code-review"));

    const registry = await collectRegistrySkills([repo], { home });
    expect(registry).toHaveLength(1);

    const result = await discover({ home, cwd: home, global: true, project: false });
    const adoption = await adoptSkills(result.files, registry, { home });
    expect(adoption.adopted).toHaveLength(1);
    expect((await readSources(home))[installed]?.repo).toBe(repo);

    const current = await checkAdopted(result.files, { home });
    expect(current[0]?.status).toBe("up-to-date");

    await writeFile(join(registrySkillDir, "SKILL.md"), skillMd("code-review", "# Review v2\n\nNew upstream body.\n"));
    const behind = await checkAdopted(result.files, { home });
    expect(behind[0]?.status).toBe("behind");
    expect(behind[0]?.manager).toBe("adopted");

    const applied = await applyAdopted(behind, { home });
    expect(applied.updated).toBe(1);
    expect(await readFile(join(installed, "SKILL.md"), "utf8")).toContain("New upstream body");
  });
});

describe("fix", () => {
  it("resurrects skills without frontmatter and drafts metadata", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-fix-"));
    const dead = join(home, ".cursor", "skills", "Magic_UI Generator!");
    await mkdir(dead, { recursive: true });
    await writeFile(
      join(dead, "SKILL.md"),
      `# Magic UI

Generates polished UI sections from a short prompt using the design tokens already in the repo.

## Steps
`,
    );

    const result = await discover({ home, cwd: home, global: true, project: false });
    const plan = await planFix(result.files);
    expect(plan).toHaveLength(1);
    expect(plan[0].problems).toContain("missing-frontmatter");
    expect(plan[0].name).toBe("magic-ui-generator");
    expect(plan[0].description).toContain("Generates polished UI sections");

    const applied = await applyFix(plan, { home });
    expect(applied.fixed).toBe(1);
    const fixedRaw = await readFile(join(dead, "SKILL.md"), "utf8");
    const parsed = parseFrontmatter(fixedRaw);
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.error).toBe("");
    expect(parsed.data.name).toBe("magic-ui-generator");
    expect(await exists(applied.batchDir ?? "")).toBe(true);
  });

  it("drafts names and descriptions deterministically", () => {
    expect(sanitizeName("Magic_UI Generator!")).toBe("magic-ui-generator");
    expect(sanitizeName("___")).toBe("unnamed-skill");
    expect(draftDescription("# Title\n\nDoes the thing very well for testing purposes.\n")).toContain("Does the thing");
    expect(draftDescription("")).toContain("Describe when");
  });

  it("tolerates and normalizes a trailing space after the --- delimiter", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-sloppy-"));
    const dir = join(home, ".cursor", "skills", "animejs-animation");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      `--- \nname: animejs-animation\ndescription: Advanced JavaScript animation library skill for creating complex web animations.\nrisk: safe\n---\n\n# Anime.js\n\nBody text.\n`,
    );
    const result = await discover({ home, cwd: home, global: true, project: false });
    const file = result.files.find((item) => item.name === "animejs-animation");
    expect(file?.hasFrontmatter).toBe(true);
    expect(file?.description).toContain("Advanced JavaScript animation");
    const plan = await planFix(result.files);
    expect(plan).toHaveLength(1);
    expect(plan[0].problems).toContain("sloppy-delimiter");
    expect(plan[0].newContent.startsWith("---\nname:")).toBe(true);
    expect(plan[0].newContent).toContain("risk: safe");
  });

  it("recovers frontmatter that was written without --- markers", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-bare-"));
    const dir = join(home, ".cursor", "skills", "vizcom");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      `name: vizcom
description: AI-powered product design tool for transforming sketches into renders.
risk: safe

# Vizcom

Use it for sketch-to-render workflows.
`,
    );
    const result = await discover({ home, cwd: home, global: true, project: false });
    const plan = await planFix(result.files);
    expect(plan).toHaveLength(1);
    expect(plan[0].problems).toContain("bare-frontmatter");
    expect(plan[0].name).toBe("vizcom");
    expect(plan[0].description).toContain("AI-powered product design tool");
    expect(plan[0].newContent).toContain("risk: safe");
    expect(plan[0].newContent).not.toContain("description: name:");
  });
});

describe("badge and html report", () => {
  it("renders a score-colored badge", () => {
    const red = renderBadge(10);
    expect(red).toContain("10/100");
    expect(red).toContain("#d1242f");
    const green = renderBadge(92);
    expect(green).toContain("#3fb950");
  });

  it("renders an escaped self-contained html dashboard", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-html-"));
    const dir = join(home, ".cursor", "skills", "xss");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      `---
name: xss
description: A test skill whose body contains <script>alert(1)</script> markup.
---

<script>alert(1)</script>
`,
    );
    const result = await discover({ home, cwd: home, global: true, project: false });
    const findings = doctor(result.files);
    const html = formatHtmlReport({
      generatedAt: "2026-08-13T00:00:00.000Z",
      result,
      summary: summarizeTokens(result.files),
      findings,
      security: [
        {
          code: "prompt-injection",
          severity: "warning",
          message: "Injected <script>alert(1)</script> markup",
          path: join(dir, "SKILL.md"),
          line: 7,
          excerpt: "<script>alert(1)</script>",
        },
      ],
      prune: planPrune(result.files),
      health: healthScore(result.files, findings),
    });
    expect(html).toContain("<!doctype html");
    expect(html).toContain("skillint report");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
