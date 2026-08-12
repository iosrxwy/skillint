#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discover } from "./discover.js";
import { doctor, summarizeTokens } from "./doctor.js";
import { compactFiles, formatDoctor, formatPrune, formatScan, formatTokens, toJson } from "./format.js";
import { planPrune } from "./prune.js";

function packageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.1.0";
  }
}

function parseRoots(paths: string[], opts: { global?: boolean; project?: boolean }) {
  const extraRoots = paths;
  const onlyExtra = extraRoots.length > 0;
  const flagPassed = opts.global === true || opts.project === true;
  return {
    extraRoots,
    global: onlyExtra || flagPassed ? Boolean(opts.global) : true,
    project: onlyExtra || flagPassed ? Boolean(opts.project) : true,
  };
}

const program = new Command();

program
  .name("skillint")
  .description("eslint for AI agent skills — audit Codex, Cursor, and Claude Code SKILL.md files")
  .version(packageVersion());

program
  .command("scan")
  .description("Discover skills and rules, then show context cost")
  .argument("[paths...]", "optional extra directories to scan")
  .option("--json", "print JSON")
  .option("-g, --global", "include ~/.cursor, ~/.claude, ~/.codex, ~/.agents")
  .option("-p, --project", "include the current project")
  .action(async (paths: string[], opts: { json?: boolean; global?: boolean; project?: boolean }) => {
    const result = await discover(parseRoots(paths, opts));
    const summary = summarizeTokens(result.files);
    if (opts.json) {
      process.stdout.write(toJson({ roots: result.roots, summary, files: compactFiles(result.files) }));
      return;
    }
    console.log(formatScan(result, summary));
  });

program
  .command("doctor")
  .description("Find duplicates, missing metadata, and oversized skills")
  .argument("[paths...]", "optional extra directories to scan")
  .option("--json", "print JSON")
  .option("-g, --global", "include ~/.cursor, ~/.claude, ~/.codex, ~/.agents")
  .option("-p, --project", "include the current project")
  .option("--fail-on <level>", "exit 1 on error or warning", "error")
  .action(async (paths: string[], opts: { json?: boolean; global?: boolean; project?: boolean; failOn?: string }) => {
    const result = await discover(parseRoots(paths, opts));
    const findings = doctor(result.files);
    if (opts.json) {
      process.stdout.write(toJson({ findings }));
    } else {
      console.log(formatDoctor(findings));
    }
    const failOn = opts.failOn ?? "error";
    const errors = findings.some((item) => item.severity === "error");
    const warnings = findings.some((item) => item.severity === "warning" || item.severity === "error");
    if (failOn === "error" && errors) process.exitCode = 1;
    if (failOn === "warning" && warnings) process.exitCode = 1;
  });

program
  .command("tokens")
  .description("Print a compact token budget")
  .argument("[paths...]", "optional extra directories to scan")
  .option("--json", "print JSON")
  .option("-g, --global", "include ~/.cursor, ~/.claude, ~/.codex, ~/.agents")
  .option("-p, --project", "include the current project")
  .action(async (paths: string[], opts: { json?: boolean; global?: boolean; project?: boolean }) => {
    const result = await discover(parseRoots(paths, opts));
    const summary = summarizeTokens(result.files);
    if (opts.json) {
      process.stdout.write(toJson(summary));
      return;
    }
    console.log(formatTokens(summary));
  });

program
  .command("prune")
  .description("Suggest which skills to keep. Never deletes files.")
  .argument("[paths...]", "optional extra directories to scan")
  .option("--keep <n>", "how many unique skills/rules to keep", "20")
  .option("--json", "print JSON")
  .option("-g, --global", "include ~/.cursor, ~/.claude, ~/.codex, ~/.agents")
  .option("-p, --project", "include the current project")
  .action(async (paths: string[], opts: { keep?: string; json?: boolean; global?: boolean; project?: boolean }) => {
    const result = await discover(parseRoots(paths, opts));
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
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
