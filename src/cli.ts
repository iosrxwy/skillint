#!/usr/bin/env node

import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discover } from "./discover.js";
import { doctor, healthScore, summarizeTokens } from "./doctor.js";
import { compactFiles, formatDoctor, formatPrune, formatScan, formatTokens, toJson } from "./format.js";
import { loadIgnoreFile } from "./ignore.js";
import { planPrune } from "./prune.js";
import { formatReport } from "./report.js";

function packageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.3.0";
  }
}

async function parseRoots(
  paths: string[],
  opts: { global?: boolean; project?: boolean; ignore?: string[] },
) {
  const extraRoots = paths;
  const onlyExtra = extraRoots.length > 0;
  const flagPassed = opts.global === true || opts.project === true;
  const fromFile = await loadIgnoreFile(resolve(process.cwd(), ".skillintignore"));
  return {
    extraRoots,
    global: onlyExtra || flagPassed ? Boolean(opts.global) : true,
    project: onlyExtra || flagPassed ? Boolean(opts.project) : true,
    ignore: [...fromFile, ...(opts.ignore ?? [])],
  };
}

function withScanOptions(command: Command): Command {
  return command
    .argument("[paths...]", "optional extra directories to scan")
    .option("--json", "print JSON")
    .option("-g, --global", "include ~/.cursor, ~/.claude, ~/.codex, ~/.agents")
    .option("-p, --project", "include the current project")
    .option("--ignore <pattern>", "ignore path pattern (repeatable)", collect, []);
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

const program = new Command();

program
  .name("skillint")
  .description("Static analysis for AI agent skills used by Codex, Cursor, and Claude Code")
  .version(packageVersion())
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
Examples:
  $ skillint scan
  $ skillint doctor -g
  $ skillint report --out skillint-report.md
  $ skillint prune --keep 12

Exit codes:
  0  success
  1  doctor findings at or above --fail-on
`,
  );

withScanOptions(
  program
    .command("scan", { isDefault: true })
    .description("Discover skills and rules, then show estimated context cost"),
).action(async (paths: string[], opts: { json?: boolean; global?: boolean; project?: boolean; ignore?: string[] }) => {
  const result = await discover(await parseRoots(paths, opts));
  const summary = summarizeTokens(result.files);
  const findings = doctor(result.files);
  if (opts.json) {
    process.stdout.write(
      toJson({
        roots: result.roots,
        summary,
        health: healthScore(result.files, findings),
        files: compactFiles(result.files),
      }),
    );
    return;
  }
  console.log(formatScan(result, summary, findings));
});

withScanOptions(
  program.command("doctor").description("Find duplicates, missing metadata, and oversized skills"),
)
  .option("--fail-on <level>", "exit 1 on error or warning", "error")
  .option("--max <n>", "max detail rows to print", "40")
  .action(
    async (
      paths: string[],
      opts: { json?: boolean; global?: boolean; project?: boolean; ignore?: string[]; failOn?: string; max?: string },
    ) => {
      const result = await discover(await parseRoots(paths, opts));
      const findings = doctor(result.files);
      if (opts.json) {
        process.stdout.write(toJson({ health: healthScore(result.files, findings), findings }));
      } else {
        const max = Number.parseInt(opts.max ?? "40", 10);
        console.log(formatDoctor(findings, { max: Number.isFinite(max) ? max : 40 }));
      }
      const failOn = opts.failOn ?? "error";
      const errors = findings.some((item) => item.severity === "error");
      const warnings = findings.some((item) => item.severity === "warning" || item.severity === "error");
      if (failOn === "error" && errors) process.exitCode = 1;
      if (failOn === "warning" && warnings) process.exitCode = 1;
    },
  );

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

withScanOptions(program.command("prune").description("Suggest which skills to keep. Never deletes files."))
  .option("--keep <n>", "how many unique skills/rules to keep", "20")
  .action(
    async (
      paths: string[],
      opts: { keep?: string; json?: boolean; global?: boolean; project?: boolean; ignore?: string[] },
    ) => {
      const result = await discover(await parseRoots(paths, opts));
      const keep = Number.parseInt(opts.keep ?? "20", 10);
      const plan = planPrune(result.files, Number.isFinite(keep) ? keep : 20);
      if (opts.json) {
        process.stdout.write(
          toJson({
            keep: compactFiles(plan.keep),
            drop: plan.drop.map((item) => ({ reason: item.reason, file: compactFiles([item.file])[0] })),
          }),
        );
        return;
      }
      console.log(formatPrune(plan));
    },
  );

withScanOptions(program.command("report").description("Write a Markdown audit report"))
  .option("-o, --out <file>", "output path", "skillint-report.md")
  .action(
    async (
      paths: string[],
      opts: { json?: boolean; global?: boolean; project?: boolean; ignore?: string[]; out?: string },
    ) => {
      const result = await discover(await parseRoots(paths, opts));
      const summary = summarizeTokens(result.files);
      const findings = doctor(result.files);
      const markdown = formatReport({
        generatedAt: new Date().toISOString(),
        result,
        summary,
        findings,
        health: healthScore(result.files, findings),
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
