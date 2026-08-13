import { describe, expect, it } from "vitest";
import { buildMenu, buildSummary, detectLang, wizardCounts } from "../src/wizard.js";
import type { WizardData } from "../src/wizard.js";
import type { SkillFile } from "../src/types.js";

function skill(name: string, path: string, bodyTokens = 100): SkillFile {
  return {
    path,
    kind: "skill",
    source: "cursor-global",
    name,
    description: "A test skill for wizard summaries.",
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

function fixture(overrides: Partial<WizardData> = {}): WizardData {
  const files = [skill("alpha", "/h/.cursor/skills/alpha/SKILL.md", 5000), skill("beta", "/h/.cursor/skills/beta/SKILL.md")];
  return {
    result: { files, roots: ["/h/.cursor/skills"] },
    findings: [{ code: "oversized", severity: "warning", message: "too big", path: files[0].path }],
    security: [
      { code: "remote-exec", severity: "error", message: "curl|bash", path: files[0].path, line: 3, excerpt: "curl | bash" },
      { code: "obfuscation", severity: "info", message: "blob", path: files[0].path, line: 9, excerpt: "AAAA" },
    ],
    prune: {
      keep: [files[1]],
      drop: [{ file: files[0], reason: "Backup", code: "backup", confidence: "safe", deletePath: "/h/.cursor/skills/alpha" }],
    },
    link: {
      actions: [
        {
          name: "alpha",
          canonicalPath: "/h/.agents/skills/alpha",
          canonicalFamily: "agents",
          linkPath: "/h/.cursor/skills/alpha",
          linkFamily: "cursor",
          status: "link",
          reason: "identical",
        },
      ],
    },
    summary: { files: 2, skills: 2, rules: 0, metaTokens: 40, bodyTokens: 5100, alwaysOnTokens: 0, bySource: {} },
    health: { score: 42, label: "poor" },
    ...overrides,
  };
}

describe("wizard", () => {
  it("counts junk, risks, oversized, and shareable items", () => {
    const counts = wizardCounts(fixture());
    expect(counts).toEqual({ skills: 2, junk: 1, risky: 1, oversized: 1, shareable: 1 });
  });

  it("renders a rich summary with examples in Chinese and English", () => {
    const data = fixture();
    const zh = buildSummary(data, "zh");
    expect(zh).toContain("体检报告");
    expect(zh).toContain("1 个重复/备份垃圾");
    expect(zh).toContain("alpha");
    expect(zh).toContain(":3");
    expect(zh).toContain("curl | bash");
    expect(zh).toContain("完整上下文窗口");
    const en = buildSummary(data, "en");
    expect(en).toContain("skillint checkup");
    expect(en).toContain("duplicates and backups");
    expect(en).toContain("full context windows");
  });

  it("shows a healthy message when nothing is wrong", () => {
    const data = fixture({
      findings: [],
      security: [],
      prune: { keep: [], drop: [] },
      link: { actions: [] },
    });
    expect(buildSummary(data, "zh")).toContain("很健康");
    const menu = buildMenu(data, "zh");
    expect(menu.map((item) => item.action)).toEqual(["ui", "quit"]);
  });

  it("offers a combined one-key fix plus audit details", () => {
    const menu = buildMenu(fixture(), "zh");
    expect(menu.map((item) => item.action)).toEqual(["fix", "audit", "ui", "quit"]);
    expect(menu[0].key).toBe("1");
    expect(menu[0].label).toContain("一键修复");
    expect(menu.at(-1)?.key).toBe("q");
  });

  it("detects the language from the environment", () => {
    expect(detectLang({ LANG: "zh_CN.UTF-8" })).toBe("zh");
    expect(detectLang({ LANG: "en_US.UTF-8" })).toBe("en");
    expect(detectLang({})).toBe("en");
  });
});
