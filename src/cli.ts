#!/usr/bin/env node

import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mapCatalog } from "./catalog.js";
import { discover } from "./discover.js";
import { doctor, healthScore, summarizeTokens, type DoctorLimits } from "./doctor.js";
import { loadConfig } from "./config.js";
import { formatGithubAnnotations, formatSecurityAnnotations, shouldAnnotate } from "./annotate.js";
import { compactFiles, formatAudit, formatDoctor, formatGithubSummary, formatLink, formatMap, formatPrune, formatPruneScript, formatScan, formatTokens, formatUpdate, toJson } from "./format.js";
import { loadIgnoreFile } from "./ignore.js";
import { scaffoldSkill } from "./init.js";
import { applyLinkPlan, applyUpdates, checkUpdates, resolveLinkPlan } from "./manage.js";
import { parseFailLevel, parseInteger } from "./options.js";
import { planPrune } from "./prune.js";
import { scanSecurity } from "./security.js";
import { quarantine, restoreLast, trashRoot } from "./trash.js";
import { runTui } from "./tui.js";
import { runWizard } from "./wizard.js";
import { collapseDeletePaths } from "./prune.js";
import { renderBadge } from "./badge.js";
import { renderRoastCard, roastLines } from "./roast.js";
import { detectLang, wizardCounts } from "./wizard.js";
import { runMcpServer } from "./mcp.js";
import { formatObservatory, formatRemoteText, scanRemoteRepos } from "./remote.js";
import { applyFix, planFix } from "./fix.js";
import { formatHtmlReport } from "./html.js";
import {
  DEFAULT_REGISTRY_REPOS,
  adoptSkills,
  applyAdopted,
  checkAdopted,
  collectRegistrySkills,
  syncRegistry,
} from "./registry.js";
import { formatReport } from "./report.js";
import type { Agent } from "./types.js";

function packageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.16.0";
  }
}

interface ParsedOptions {
  extraRoots: string[];
  global: boolean;
  project: boolean;
  ignore: string[];
  limits?: Partial<DoctorLimits>;
}

async function parseRoots(
  paths: string[],
  opts: { global?: boolean; project?: boolean; ignore?: string[] },
): Promise<ParsedOptions> {
  const extraRoots = paths;
  const onlyExtra = extraRoots.length > 0;
  const flagPassed = opts.global === true || opts.project === true;
  const cwd = process.cwd();
  const [fromFile, config] = await Promise.all([
    loadIgnoreFile(resolve(cwd, ".skillintignore")),
    loadConfig(cwd),
  ]);
  return {
    extraRoots,
    global: onlyExtra || flagPassed ? Boolean(opts.global) : true,
    project: onlyExtra || flagPassed ? Boolean(opts.project) : true,
    ignore: [...fromFile, ...(config.ignore ?? []), ...(opts.ignore ?? [])],
    limits: config.limits,
  };
}

function withScanOptions(command: Command): Command {
  return command
    .argument("[paths...]", "optional extra directories to scan")
    .option("--json", "print JSON")
    .option("-g, --global", "include user-level dirs for Cursor, Claude, Codex, Grok, Gemini, Copilot, and others")
    .option("-p, --project", "include the current project")
    .option("--ignore <pattern>", "ignore path pattern (repeatable)", collect, [])
    .option("--annotate", "print GitHub workflow annotations");
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function maybeGithubSummary(markdown: string): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  await writeFile(file, markdown, { flag: "a" });
}

function writeAnnotations(findings: ReturnType<typeof doctor>, opts: { annotate?: boolean; json?: boolean }): void {
  if (!shouldAnnotate(opts.annotate)) return;
  const text = formatGithubAnnotations(findings);
  if (!text) return;
  const stream = opts.json ? process.stderr : process.stdout;
  stream.write(`${text}\n`);
}

const program = new Command();

program
  .name("skillint")
  .description("Static analysis for AI agent skills used by Codex, Cursor, Claude Code, Grok, Gemini, Copilot, and others")
  .version(packageVersion())
  .showHelpAfterError()
  .argument("[paths...]", "optional extra directories to check")
  .action(async (paths: string[]) => {
    const parsed = await parseRoots(paths, {});
    await runWizard(parsed);
  })
  .addHelpText(
    "after",
    `
Examples:
  $ skillint              guided checkup: scan, explain, offer fixes
  $ skillint scan
  $ skillint map --agent cursor
  $ skillint doctor -g
  $ skillint doctor --fail-under 80
  $ skillint audit -g
  $ skillint ui -g
  $ skillint init code-review
  $ skillint report --out skillint-report.md
  $ skillint prune
  $ skillint prune --script
  $ skillint link
  $ skillint link --apply
  $ skillint update

Exit codes:
  0  success
  1  doctor findings at or above --fail-on, or health below --fail-under
`,
  );

withScanOptions(
  program
    .command("scan")
    .description("Inventory skill/rule files and estimate their size (not effective loading)"),
).action(async (paths: string[], opts: { json?: boolean; global?: boolean; project?: boolean; ignore?: string[]; annotate?: boolean }) => {
  const started = Date.now();
  const parsed = await parseRoots(paths, opts);
  const result = await discover(parsed);
  const summary = summarizeTokens(result.files);
  const findings = doctor(result.files, parsed.limits);
  const health = healthScore(result.files, findings);
  const elapsedMs = Date.now() - started;
  if (opts.json) {
    process.stdout.write(
      toJson({
        inventory: "physical",
        roots: result.roots,
        summary,
        health,
        elapsedMs,
        files: compactFiles(result.files),
      }),
    );
  } else {
    console.log(formatScan(result, summary, findings, elapsedMs));
  }
  writeAnnotations(findings, opts);
  await maybeGithubSummary(formatGithubSummary({ command: "scan", health, summary, findings }));
});

program
  .command("map [cwd]")
  .description("Resolve one agent's effective, coexisting, conditional, shadowed, and unknown resources")
  .requiredOption("--agent <agent>", "catalog adapter: cursor, claude, or codex")
  .option("--json", "print schema-versioned JSON")
  .action(async (cwd: string | undefined, opts: { agent: string; json?: boolean }) => {
    const agent = parseAgent(opts.agent);
    const result = await mapCatalog({ agent, cwd });
    if (opts.json) {
      process.stdout.write(toJson(result));
      return;
    }
    console.log(formatMap(result));
  });

withScanOptions(
  program.command("doctor").description("Find duplicates, missing metadata, and oversized skills"),
)
  .option("--fail-on <level>", "exit 1 on error, warning, or none", "error")
  .option("--fail-under <score>", "exit 1 when the health score is below this number (0-100)")
  .option("--max <n>", "max detail rows to print", "40")
  .action(
    async (
      paths: string[],
      opts: {
        json?: boolean;
        global?: boolean;
        project?: boolean;
        ignore?: string[];
        failOn?: string;
        failUnder?: string;
        max?: string;
        annotate?: boolean;
      },
    ) => {
      const failOn = parseFailLevel(opts.failOn ?? "error");
      const threshold =
        opts.failUnder == null ? undefined : parseInteger(opts.failUnder, "--fail-under", { min: 0, max: 100 });
      const max = parseInteger(opts.max ?? "40", "--max", { min: 1 });
      const parsed = await parseRoots(paths, opts);
      const result = await discover(parsed);
      const findings = doctor(result.files, parsed.limits);
      const health = healthScore(result.files, findings);
      const summary = summarizeTokens(result.files);
      if (opts.json) {
        process.stdout.write(toJson({ health, findings }));
      } else {
        console.log(formatDoctor(findings, { max, health }));
      }
      writeAnnotations(findings, opts);
      await maybeGithubSummary(formatGithubSummary({ command: "doctor", health, summary, findings }));
      const errors = findings.some((item) => item.severity === "error");
      const warnings = findings.some((item) => item.severity === "warning" || item.severity === "error");
      if (failOn === "error" && errors) process.exitCode = 1;
      if (failOn === "warning" && warnings) process.exitCode = 1;
      if (threshold != null && health.score < threshold) process.exitCode = 1;
    },
  );

program
  .command("init <name>")
  .description("Scaffold a new SKILL.md that passes doctor. Never overwrites files.")
  .option("-d, --dir <dir>", "parent directory for the skill folder", "skills")
  .option("--description <text>", "frontmatter description")
  .action(async (name: string, opts: { dir?: string; description?: string }) => {
    const { path } = await scaffoldSkill({ name, dir: opts.dir, description: opts.description });
    console.log(`created ${path}`);
    console.log("Fill in the description and steps, then run `skillint doctor` to verify.");
  });

withScanOptions(program.command("tokens").description("Print a compact token budget")).action(
  async (paths: string[], opts: { json?: boolean; global?: boolean; project?: boolean; ignore?: string[] }) => {
    const result = await discover(await parseRoots(paths, opts));
    const summary = summarizeTokens(result.files);
    if (opts.json) {
      process.stdout.write(toJson(summary));
      return;
    }
    console.log(formatTokens(summary));
  },
);

withScanOptions(program.command("prune").description("Plan a cleanup. --apply moves safe items to the skillint trash (undoable)."))
  .option("--keep <n>", "also suggest dropping unique skills beyond this ranked count")
  .option("--script", "print a reviewable shell script of safe trash commands")
  .option("--apply", "move all safe items into ~/.skillint/trash (undo with `skillint restore`)")
  .option("--max <n>", "max rows per cleanup section", "20")
  .action(
    async (
      paths: string[],
      opts: {
        keep?: string;
        json?: boolean;
        script?: boolean;
        apply?: boolean;
        max?: string;
        global?: boolean;
        project?: boolean;
        ignore?: string[];
      },
    ) => {
      const result = await discover(await parseRoots(paths, opts));
      const keep = opts.keep == null ? undefined : parseInteger(opts.keep, "--keep", { min: 0 });
      const max = parseInteger(opts.max ?? "20", "--max", { min: 1 });
      const plan = planPrune(result.files, keep);
      if (opts.apply) {
        const safePaths = collapseDeletePaths(
          plan.drop.filter((item) => item.confidence === "safe").map((item) => item.deletePath),
        );
        if (safePaths.length === 0) {
          console.log("Nothing safe to trash.");
          return;
        }
        const moved = await quarantine(safePaths);
        for (const item of moved.items) console.log(`trashed ${item.from}`);
        for (const failure of moved.failed) console.log(`failed  ${failure.path} (${failure.error})`);
        console.log(`\n${moved.items.length} item(s) moved to ${moved.batchDir}`);
        console.log("Undo with: skillint restore");
        return;
      }
      if (opts.json) {
        process.stdout.write(
          toJson({
            keep: compactFiles(plan.keep),
            drop: plan.drop.map((item) => ({
              reason: item.reason,
              code: item.code,
              confidence: item.confidence,
              keepPath: item.keepPath,
              deletePath: item.deletePath,
              file: compactFiles([item.file])[0],
            })),
          }),
        );
        return;
      }
      if (opts.script) {
        process.stdout.write(formatPruneScript(plan));
        return;
      }
      console.log(formatPrune(plan, { max }));
    },
  );

program
  .command("trash <paths...>")
  .description("Move files or folders into ~/.skillint/trash. Undo with `skillint restore`.")
  .action(async (paths: string[]) => {
    const moved = await quarantine(paths.map((path) => resolve(path)));
    for (const item of moved.items) console.log(`trashed ${item.from}`);
    for (const failure of moved.failed) console.log(`failed  ${failure.path} (${failure.error})`);
    if (moved.items.length > 0) {
      console.log(`\n${moved.items.length} item(s) moved to ${moved.batchDir}`);
      console.log("Undo with: skillint restore");
    }
    if (moved.failed.length > 0) process.exitCode = 1;
  });

program
  .command("restore")
  .description("Undo the most recent skillint trash batch.")
  .action(async () => {
    const result = await restoreLast();
    if (!result) {
      console.log(`Nothing to restore in ${trashRoot()}.`);
      return;
    }
    for (const item of result.restored) console.log(`restored ${item.from}`);
    for (const skip of result.skipped) console.log(`skipped  ${skip.item.from} (${skip.reason})`);
    console.log(`\n${result.restored.length} item(s) restored from ${result.batchDir}`);
  });

withScanOptions(
  program.command("audit").description("Scan installed skills for dangerous patterns. Read-only."),
)
  .option("--fail-on <level>", "exit 1 on error, warning, or none", "error")
  .option("--max <n>", "max detail rows to print", "40")
  .action(
    async (
      paths: string[],
      opts: {
        json?: boolean;
        global?: boolean;
        project?: boolean;
        ignore?: string[];
        failOn?: string;
        max?: string;
        annotate?: boolean;
      },
    ) => {
      const failOn = parseFailLevel(opts.failOn ?? "error");
      const max = parseInteger(opts.max ?? "40", "--max", { min: 1 });
      const result = await discover(await parseRoots(paths, opts));
      const findings = await scanSecurity(result.files);
      if (opts.json) {
        process.stdout.write(toJson({ scanned: result.files.length, findings }));
      } else {
        console.log(formatAudit(findings, { max, scanned: result.files.length }));
      }
      if (shouldAnnotate(opts.annotate) && !opts.json) {
        const text = formatSecurityAnnotations(findings);
        if (text) console.log(text);
      }
      const errors = findings.some((item) => item.severity === "error");
      const warnings = findings.some((item) => item.severity === "warning" || item.severity === "error");
      if (failOn === "error" && errors) process.exitCode = 1;
      if (failOn === "warning" && warnings) process.exitCode = 1;
    },
  );

withScanOptions(program.command("link").description("Share identical skills across agents with symlinks. Dry run by default."))
  .option("--apply", "replace identical copies with symlinks to the canonical copy")
  .option("--max <n>", "max rows to print", "20")
  .action(
    async (
      paths: string[],
      opts: { json?: boolean; apply?: boolean; max?: string; global?: boolean; project?: boolean; ignore?: string[] },
    ) => {
      const result = await discover(await parseRoots(paths, opts));
      const plan = await resolveLinkPlan(result.files);
      const max = parseInteger(opts.max ?? "20", "--max", { min: 1 });
      const applied = opts.apply ? await applyLinkPlan(plan) : undefined;
      if (opts.json) {
        process.stdout.write(toJson({ ...plan, applied }));
        return;
      }
      console.log(formatLink(plan, { max, applied }));
    },
  );

withScanOptions(program.command("update").description("Check git-backed and adopted skills for upstream updates. Dry run by default."))
  .option("--apply", "update checkouts and adopted skills that are behind (undoable for adopted)")
  .option("--max <n>", "max rows to print", "20")
  .action(
    async (
      paths: string[],
      opts: { json?: boolean; apply?: boolean; max?: string; global?: boolean; project?: boolean; ignore?: string[] },
    ) => {
      const result = await discover(await parseRoots(paths, opts));
      const adopted = await checkAdopted(result.files);
      const adoptedPaths = new Set(adopted.map((item) => item.path));
      const gitChecks = (await checkUpdates(result.files)).filter((item) => !adoptedPaths.has(item.path));
      const checks = [...gitChecks, ...adopted].sort((a, b) => a.path.localeCompare(b.path));
      const max = parseInteger(opts.max ?? "20", "--max", { min: 1 });
      let applied: { updated: number; skipped: number } | undefined;
      if (opts.apply) {
        const fromGit = await applyUpdates(gitChecks);
        const fromRegistry = await applyAdopted(adopted);
        applied = { updated: fromGit.updated + fromRegistry.updated, skipped: fromGit.skipped + fromRegistry.skipped };
      }
      if (opts.json) {
        process.stdout.write(toJson({ checks, applied }));
        return;
      }
      console.log(formatUpdate(checks, { max, applied }));
    },
  );

program
  .command("adopt")
  .description("Match orphan skills to known public repos so `skillint update` can batch-update them.")
  .argument("[paths...]", "optional extra directories to scan")
  .option("-g, --global", "include user-level dirs")
  .option("-p, --project", "include the current project")
  .option("--ignore <pattern>", "ignore path pattern (repeatable)", collect, [])
  .option("--repo <owner/repo>", "additional registry repo (repeatable)", collect, [])
  .option("--json", "print JSON")
  .action(
    async (
      paths: string[],
      opts: { global?: boolean; project?: boolean; ignore?: string[]; repo?: string[]; json?: boolean },
    ) => {
      const repos = [...DEFAULT_REGISTRY_REPOS, ...(opts.repo ?? [])];
      const sync = await syncRegistry(repos);
      const registry = await collectRegistrySkills(sync.synced);
      const result = await discover(await parseRoots(paths, opts));
      const adoption = await adoptSkills(result.files, registry);
      if (opts.json) {
        process.stdout.write(toJson({ sync, ...adoption }));
        return;
      }
      console.log(`registry: ${sync.synced.length} repo(s) synced${sync.failed.length ? `, ${sync.failed.length} failed (${sync.failed.join(", ")})` : ""}`);
      console.log(`registry skills: ${registry.length}`);
      console.log("");
      for (const item of adoption.adopted) {
        console.log(`adopted  ${item.name}  <- ${item.repo}`);
      }
      console.log(
        `\n${adoption.adopted.length} adopted by content match · ${adoption.alreadyAdopted} already adopted · ${adoption.nameCandidates.length} name-only candidates · ${adoption.orphans} unmatched`,
      );
      if (adoption.nameCandidates.length > 0) {
        console.log("\nName-only candidates (content differs; verify before trusting):");
        for (const item of adoption.nameCandidates.slice(0, 10)) {
          console.log(`  ? ${item.name}  ~ ${item.repo}`);
        }
      }
      if (adoption.adopted.length > 0) {
        console.log("\nNext: `skillint update` now covers adopted skills; `--apply` updates them (undoable).");
      }
    },
  );

withScanOptions(program.command("fix").description("Repair skills with missing frontmatter, names, or descriptions. Dry run by default."))
  .option("--apply", "write repairs; originals go to ~/.skillint/trash first")
  .action(
    async (
      paths: string[],
      opts: { json?: boolean; apply?: boolean; global?: boolean; project?: boolean; ignore?: string[] },
    ) => {
      const result = await discover(await parseRoots(paths, opts));
      const plan = await planFix(result.files);
      if (opts.json) {
        process.stdout.write(toJson({ plan: plan.map(({ newContent, ...rest }) => rest), applied: undefined }));
        return;
      }
      if (plan.length === 0) {
        console.log("Nothing to fix: every skill has frontmatter, a name, and a description.");
        return;
      }
      for (const item of plan) {
        console.log(`${item.problems.join(", ")}  ${item.path}`);
        console.log(`  name: ${item.name}`);
        console.log(`  description: ${item.description}`);
      }
      if (!opts.apply) {
        console.log(`\n${plan.length} skill(s) repairable. Run \`skillint fix --apply\` to write (originals are trashed first).`);
        return;
      }
      const applied = await applyFix(plan);
      console.log(`\nfixed ${applied.fixed} skill(s); originals saved to ${applied.batchDir ?? "the skillint trash"}`);
      console.log("To revert one: delete the new SKILL.md, then run `skillint restore`.");
    },
  );

withScanOptions(program.command("roast").description("Roast your skills folder. Read-only, shareable, mildly rude."))
  .option("--card [file]", "also write a shareable SVG card")
  .action(
    async (
      paths: string[],
      opts: { json?: boolean; card?: string | boolean; global?: boolean; project?: boolean; ignore?: string[] },
    ) => {
      const parsed = await parseRoots(paths, opts);
      const result = await discover(parsed);
      const findings = doctor(result.files, parsed.limits);
      const [security, link] = await Promise.all([scanSecurity(result.files), resolveLinkPlan(result.files)]);
      const summary = summarizeTokens(result.files);
      const health = healthScore(result.files, findings);
      const data = { result, findings, security, prune: planPrune(result.files), link, summary, health };
      const counts = wizardCounts(data);
      const biggestFile = [...result.files].sort((a, b) => b.bodyTokens - a.bodyTokens)[0];
      const input = {
        counts,
        bodyTokens: summary.bodyTokens,
        contextWindows: Math.max(1, Math.round(summary.bodyTokens / 128000)),
        health,
        biggest: biggestFile ? { name: biggestFile.name, tokens: biggestFile.bodyTokens } : undefined,
      };
      const lang = detectLang();
      const lines = roastLines(input, lang);
      if (opts.json) {
        process.stdout.write(toJson({ ...input, lines }));
        return;
      }
      console.log("");
      for (const line of lines) console.log(`  ${line}`);
      console.log("");
      console.log(`  — skillint roast · https://github.com/iosrxwy/skillint`);
      if (opts.card != null && opts.card !== false) {
        const out = resolve(typeof opts.card === "string" ? opts.card : "skillint-roast.svg");
        await writeFile(out, renderRoastCard(input, lang), "utf8");
        console.log(`\n  card: ${out}`);
      }
    },
  );

program
  .command("scan-remote <repos...>")
  .description("Audit public skill repos BEFORE installing (owner/repo or local path). Nothing is executed.")
  .option("--json", "print JSON")
  .option("--markdown <file>", "write an observatory-style markdown table")
  .option("--max <n>", "max findings per repo in text output", "10")
  .action(async (repos: string[], opts: { json?: boolean; markdown?: string; max?: string }) => {
    const max = parseInteger(opts.max ?? "10", "--max", { min: 1 });
    const results = await scanRemoteRepos(repos);
    if (opts.json) {
      process.stdout.write(toJson(results));
    } else {
      for (const result of results) {
        console.log(formatRemoteText(result, max));
        console.log("");
      }
    }
    if (opts.markdown) {
      const out = resolve(opts.markdown);
      await writeFile(out, formatObservatory(results, new Date().toISOString().slice(0, 10)), "utf8");
      console.log(`wrote ${out}`);
    }
    if (results.some((result) => result.verdict === "risky")) process.exitCode = 1;
  });

program
  .command("mcp")
  .description("Run skillint as an MCP server (stdio) so agents can call it as a native tool.")
  .action(async () => {
    await runMcpServer();
  });

withScanOptions(program.command("badge").description("Write an SVG health badge for your README."))
  .option("-o, --out <file>", "output path", "skills-health.svg")
  .action(
    async (
      paths: string[],
      opts: { out?: string; json?: boolean; global?: boolean; project?: boolean; ignore?: string[] },
    ) => {
      const parsed = await parseRoots(paths, opts);
      const result = await discover(parsed);
      const findings = doctor(result.files, parsed.limits);
      const health = healthScore(result.files, findings);
      const out = resolve(opts.out ?? "skills-health.svg");
      await writeFile(out, renderBadge(health.score), "utf8");
      console.log(`wrote ${out} (health ${health.score}/100)`);
      const embed = opts.out ?? "skills-health.svg";
      console.log(`embed: ![skills health](${embed.startsWith("/") ? embed : `./${embed}`})`);
    },
  );

program
  .command("ui")
  .description("Interactive terminal UI: issues, audit, cleanup, links, largest")
  .argument("[paths...]", "optional extra directories to scan")
  .option("-g, --global", "include user-level dirs for Cursor, Claude, Codex, Grok, Gemini, Copilot, and others")
  .option("-p, --project", "include the current project")
  .option("--ignore <pattern>", "ignore path pattern (repeatable)", collect, [])
  .action(async (paths: string[], opts: { global?: boolean; project?: boolean; ignore?: string[] }) => {
    const parsed = await parseRoots(paths, opts);
    await runTui(parsed);
  });

withScanOptions(program.command("report").description("Write a Markdown audit report, optionally with an HTML dashboard"))
  .option("-o, --out <file>", "output path", "skillint-report.md")
  .option("--html [file]", "also write a self-contained HTML dashboard")
  .action(
    async (
      paths: string[],
      opts: { json?: boolean; global?: boolean; project?: boolean; ignore?: string[]; out?: string; html?: string | boolean },
    ) => {
      const parsed = await parseRoots(paths, opts);
      const result = await discover(parsed);
      const summary = summarizeTokens(result.files);
      const findings = doctor(result.files, parsed.limits);
      const security = await scanSecurity(result.files);
      const health = healthScore(result.files, findings);
      const generatedAt = new Date().toISOString();
      const markdown = formatReport({ generatedAt, result, summary, findings, health, security });
      if (opts.json) {
        process.stdout.write(toJson({ out: opts.out, summary, findings }));
        return;
      }
      const out = resolve(opts.out ?? "skillint-report.md");
      await writeFile(out, markdown, "utf8");
      console.log(`wrote ${out}`);
      if (opts.html != null && opts.html !== false) {
        const htmlOut = resolve(typeof opts.html === "string" ? opts.html : "skillint-report.html");
        const html = formatHtmlReport({
          generatedAt,
          result,
          summary,
          findings,
          security,
          prune: planPrune(result.files),
          health,
        });
        await writeFile(htmlOut, html, "utf8");
        console.log(`wrote ${htmlOut}`);
      }
    },
  );

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

function parseAgent(value: string): Agent {
  if (value === "cursor" || value === "claude" || value === "codex") return value;
  throw new Error(`Invalid --agent "${value}". Expected cursor, claude, or codex.`);
}
