import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export interface TrashItem {
  from: string;
  to: string;
}

export interface TrashManifest {
  createdAt: string;
  items: TrashItem[];
}

export interface QuarantineResult {
  batchDir: string;
  items: TrashItem[];
  failed: Array<{ path: string; error: string }>;
}

export interface RestoreResult {
  batchDir: string;
  restored: TrashItem[];
  skipped: Array<{ item: TrashItem; reason: string }>;
}

export function trashRoot(home = homedir()): string {
  return join(home, ".skillint", "trash");
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function quarantine(
  paths: string[],
  options: { home?: string; now?: Date } = {},
): Promise<QuarantineResult> {
  const batchDir = join(trashRoot(options.home), stamp(options.now ?? new Date()));
  await mkdir(batchDir, { recursive: true });
  const items: TrashItem[] = [];
  const failed: QuarantineResult["failed"] = [];
  let index = 0;
  for (const from of paths) {
    const to = join(batchDir, `${String(index).padStart(3, "0")}-${basename(from)}`);
    index += 1;
    try {
      await rename(from, to);
      items.push({ from, to });
    } catch (error) {
      failed.push({ path: from, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const manifest: TrashManifest = { createdAt: new Date().toISOString(), items };
  await writeFile(join(batchDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { batchDir, items, failed };
}

export async function listBatches(home?: string): Promise<string[]> {
  const root = trashRoot(home);
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
      .sort();
  } catch {
    return [];
  }
}

export async function restoreBatch(batchDir: string): Promise<RestoreResult> {
  const raw = await readFile(join(batchDir, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw) as TrashManifest;
  const restored: TrashItem[] = [];
  const skipped: RestoreResult["skipped"] = [];
  for (const item of manifest.items) {
    if (await exists(item.from)) {
      skipped.push({ item, reason: "destination already exists" });
      continue;
    }
    if (!(await exists(item.to))) {
      skipped.push({ item, reason: "trashed copy is missing" });
      continue;
    }
    await mkdir(dirname(item.from), { recursive: true });
    try {
      await rename(item.to, item.from);
      restored.push(item);
    } catch (error) {
      skipped.push({ item, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { batchDir, restored, skipped };
}

export async function restoreLast(home?: string): Promise<RestoreResult | null> {
  const batches = await listBatches(home);
  for (let index = batches.length - 1; index >= 0; index -= 1) {
    const batchDir = batches[index];
    try {
      const result = await restoreBatch(batchDir);
      if (result.restored.length > 0 || result.skipped.length > 0) return result;
    } catch {
      continue;
    }
  }
  return null;
}

export function trashCommand(path: string): string {
  return `skillint trash '${path.replace(/'/g, `'\\''`)}'`;
}
