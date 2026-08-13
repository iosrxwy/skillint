#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "cli.ts");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(src) || !existsSync(tsc)) process.exit(0);

const result = spawnSync(process.execPath, [tsc], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
