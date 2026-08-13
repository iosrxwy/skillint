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
import { formatReport } from "./report.js";
import type { Agent } from "./types.js";

function packageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.13.0";
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

withScanOptions(program.command("update").description("Check git-backed skills for upstream updates. Dry run by default."))
  .option("--apply", "git pull --ff-only on checkouts that are behind")
  .option("--max <n>", "max rows to print", "20")
  .action(
    async (
      paths: string[],
      opts: { json?: boolean; apply?: boolean; max?: string; global?: boolean; project?: boolean; ignore?: string[] },
    ) => {
      const result = await discover(await parseRoots(paths, opts));
      const checks = await checkUpdates(result.files);
      const max = parseInteger(opts.max ?? "20", "--max", { min: 1 });
      const applied = opts.apply ? await applyUpdates(checks) : undefined;
      if (opts.json) {
        process.stdout.write(toJson({ checks, applied }));
        return;
      }
      console.log(formatUpdate(checks, { max, applied }));
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

withScanOptions(program.command("report").description("Write a Markdown audit report"))
  .option("-o, --out <file>", "output path", "skillint-report.md")
  .action(
    async (
      paths: string[],
      opts: { json?: boolean; global?: boolean; project?: boolean; ignore?: string[]; out?: string },
    ) => {
      const parsed = await parseRoots(paths, opts);
      const result = await discover(parsed);
      const summary = summarizeTokens(result.files);
      const findings = doctor(result.files, parsed.limits);
      const security = await scanSecurity(result.files);
      const markdown = formatReport({
        generatedAt: new Date().toISOString(),
        result,
        summary,
        findings,
        health: healthScore(result.files, findings),
        security,
      });
      if (opts.json) {
        process.stdout.write(toJson({ out: opts.out, summary, findings }));
        return;
      }
      const out = resolve(opts.out ?? "skillint-report.md");
      await writeFile(out, markdown, "utf8");
      console.log(`wrote ${out}`);
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
