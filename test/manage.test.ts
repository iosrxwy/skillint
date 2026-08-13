import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discover } from "../src/discover.js";
import { applyLinkPlan, checkUpdates, planLink, resolveLinkPlan } from "../src/manage.js";
import { planPrune } from "../src/prune.js";

async function writeSkill(dir: string, name: string, body = "Do the thing."): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---
name: ${name}
description: A portable agent skill used to verify cross-agent linking.
---

${body}
`,
  );
}

describe("skill manager", () => {
  it("does not mark cross-agent identical copies as safe deletions", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-link-prune-"));
    await writeSkill(join(home, ".cursor", "skills", "code-review"), "code-review");
    await writeSkill(join(home, ".grok", "skills", "code-review"), "code-review");
    const result = await discover({ home, cwd: home, global: true, project: false });
    const plan = planPrune(result.files);
    expect(plan.drop.filter((item) => item.confidence === "safe")).toHaveLength(0);
    expect(plan.drop.some((item) => item.code === "synced-copy")).toBe(false);
  });

  it("plans a symlink from Grok to the shared agents copy", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-link-plan-"));
    await writeSkill(join(home, ".agents", "skills", "code-review"), "code-review");
    await writeSkill(join(home, ".cursor", "skills", "code-review"), "code-review");
    await writeSkill(join(home, ".grok", "skills", "code-review"), "code-review");
    const result = await discover({ home, cwd: home, global: true, project: false });
    const plan = planLink(result.files);
    expect(plan.actions.every((item) => item.status === "link")).toBe(true);
    expect(plan.actions.every((item) => item.canonicalFamily === "agents")).toBe(true);
    expect(plan.actions.map((item) => item.linkFamily).sort()).toEqual(["cursor", "grok"]);
  });

  it("replaces an identical copy with a symlink and leaves conflicts alone", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-link-apply-"));
    const canonical = join(home, ".agents", "skills", "code-review");
    const grok = join(home, ".grok", "skills", "code-review");
    const cursor = join(home, ".cursor", "skills", "code-review");
    await writeSkill(canonical, "code-review", "Shared body");
    await writeSkill(grok, "code-review", "Shared body");
    await writeSkill(cursor, "code-review", "Different body");
    const result = await discover({ home, cwd: home, global: true, project: false });
    const plan = await resolveLinkPlan(result.files);
    expect(plan.actions.some((item) => item.linkFamily === "grok" && item.status === "link")).toBe(true);
    expect(plan.actions.some((item) => item.linkFamily === "cursor" && item.status === "conflict")).toBe(true);
    await applyLinkPlan(plan);
    const { realpath } = await import("node:fs/promises");
    expect(await realpath(grok)).toBe(await realpath(canonical));
    const cursorSkill = await import("node:fs/promises").then((fs) => fs.readFile(join(cursor, "SKILL.md"), "utf8"));
    expect(cursorSkill).toContain("Different body");
  });

  it("reports marketplace copies as not git-backed", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-update-"));
    await writeSkill(join(home, ".cursor", "skills", "code-review"), "code-review");
    const result = await discover({ home, cwd: home, global: true, project: false });
    const checks = await checkUpdates(result.files, { home, cwd: home });
    expect(checks.some((item) => item.status === "not-git")).toBe(true);
  });
});
