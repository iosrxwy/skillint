import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listBatches, quarantine, restoreLast, trashCommand } from "../src/trash.js";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("trash quarantine", () => {
  it("moves items into a manifest-backed batch and restores them", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-trash-"));
    const victim = join(home, ".cursor", "skills", "old-skill");
    await mkdir(victim, { recursive: true });
    await writeFile(join(victim, "SKILL.md"), "body");

    const moved = await quarantine([victim], { home });
    expect(moved.items).toHaveLength(1);
    expect(moved.failed).toHaveLength(0);
    expect(await exists(victim)).toBe(false);
    expect(await exists(moved.items[0].to)).toBe(true);
    const manifest = JSON.parse(await readFile(join(moved.batchDir, "manifest.json"), "utf8"));
    expect(manifest.items[0].from).toBe(victim);

    const restored = await restoreLast(home);
    expect(restored?.restored).toHaveLength(1);
    expect(await exists(victim)).toBe(true);
    expect(await readFile(join(victim, "SKILL.md"), "utf8")).toBe("body");
  });

  it("never restores over an existing destination", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-trash-conflict-"));
    const victim = join(home, "skill-dir");
    await mkdir(victim, { recursive: true });
    await writeFile(join(victim, "SKILL.md"), "original");

    await quarantine([victim], { home });
    await mkdir(victim, { recursive: true });
    await writeFile(join(victim, "SKILL.md"), "recreated");

    const restored = await restoreLast(home);
    expect(restored?.restored).toHaveLength(0);
    expect(restored?.skipped[0]?.reason).toBe("destination already exists");
    expect(await readFile(join(victim, "SKILL.md"), "utf8")).toBe("recreated");
    expect(await listBatches(home)).toHaveLength(1);
  });

  it("reports missing paths without failing the batch", async () => {
    const home = await mkdtemp(join(tmpdir(), "skillint-trash-missing-"));
    const ghost = join(home, "does-not-exist");
    const moved = await quarantine([ghost], { home });
    expect(moved.items).toHaveLength(0);
    expect(moved.failed).toHaveLength(1);
  });

  it("emits shell-safe trash commands", () => {
    expect(trashCommand("/tmp/it's here")).toBe("skillint trash '/tmp/it'\\''s here'");
  });
});
