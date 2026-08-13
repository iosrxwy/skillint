import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export const DEFAULT_WALK_MAX_DEPTH = 32;
export const DEFAULT_WALK_MAX_DIRECTORIES = 10_000;

const DEFAULT_SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "vendor",
]);

export interface BoundedWalkOptions {
  maxDepth?: number;
  maxDirectories?: number;
  allowExternalRootSymlinks?: boolean;
  skipDirectories?: ReadonlySet<string>;
}

export interface WalkEntry {
  logicalPath: string;
  realPath: string;
}

export interface WalkIssue {
  kind: "depth-limit" | "directory-limit" | "symlink-escape";
  path: string;
}

export interface BoundedWalkResult {
  files: WalkEntry[];
  directories: WalkEntry[];
  issues: WalkIssue[];
}

function isWithin(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isApproved(path: string, roots: Set<string>): boolean {
  for (const root of roots) {
    if (isWithin(path, root)) return true;
  }
  return false;
}

export async function walkBounded(
  root: string,
  options: BoundedWalkOptions = {},
): Promise<BoundedWalkResult> {
  const result: BoundedWalkResult = { files: [], directories: [], issues: [] };
  const logicalRoot = resolve(root);
  const rootInfo = await stat(logicalRoot).catch(() => null);
  if (!rootInfo) return result;

  const canonicalRoot = await realpath(logicalRoot).catch(() => logicalRoot);
  if (rootInfo.isFile()) {
    result.files.push({ logicalPath: logicalRoot, realPath: canonicalRoot });
    return result;
  }
  if (!rootInfo.isDirectory()) return result;

  const maxDepth = Math.max(0, options.maxDepth ?? DEFAULT_WALK_MAX_DEPTH);
  const maxDirectories = Math.max(1, options.maxDirectories ?? DEFAULT_WALK_MAX_DIRECTORIES);
  const skipDirectories = options.skipDirectories ?? DEFAULT_SKIP_DIRECTORIES;
  const approvedRoots = new Set([canonicalRoot]);
  const seenDirectories = new Set<string>();
  const seenFiles = new Set<string>();
  let directoryLimitReported = false;

  async function walkDirectory(logicalDir: string, canonicalDir: string, depth: number): Promise<void> {
    if (seenDirectories.has(canonicalDir)) return;
    if (seenDirectories.size >= maxDirectories) {
      if (!directoryLimitReported) {
        result.issues.push({ kind: "directory-limit", path: logicalDir });
        directoryLimitReported = true;
      }
      return;
    }

    seenDirectories.add(canonicalDir);
    result.directories.push({ logicalPath: logicalDir, realPath: canonicalDir });
    const entries = await readdir(logicalDir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const logicalPath = join(logicalDir, entry.name);
      if ((entry.isDirectory() || entry.isSymbolicLink()) && skipDirectories.has(entry.name)) continue;

      if (entry.isSymbolicLink()) {
        const [canonicalPath, targetInfo] = await Promise.all([
          realpath(logicalPath).catch(() => null),
          stat(logicalPath).catch(() => null),
        ]);
        if (!canonicalPath || !targetInfo) continue;

        if (targetInfo.isDirectory()) {
          const isRootLevelExternal =
            depth === 0 && options.allowExternalRootSymlinks !== false && !isApproved(canonicalPath, approvedRoots);
          if (isRootLevelExternal) approvedRoots.add(canonicalPath);
          if (!isApproved(canonicalPath, approvedRoots)) {
            result.issues.push({ kind: "symlink-escape", path: logicalPath });
            continue;
          }
          if (depth + 1 > maxDepth) {
            result.issues.push({ kind: "depth-limit", path: logicalPath });
            continue;
          }
          await walkDirectory(logicalPath, canonicalPath, depth + 1);
          continue;
        }

        if (targetInfo.isFile()) {
          if (!isApproved(canonicalPath, approvedRoots)) {
            result.issues.push({ kind: "symlink-escape", path: logicalPath });
            continue;
          }
          if (!seenFiles.has(canonicalPath)) {
            seenFiles.add(canonicalPath);
            result.files.push({ logicalPath, realPath: canonicalPath });
          }
        }
        continue;
      }

      if (entry.isDirectory()) {
        if (depth + 1 > maxDepth) {
          result.issues.push({ kind: "depth-limit", path: logicalPath });
          continue;
        }
        const canonicalPath = await realpath(logicalPath).catch(() => logicalPath);
        if (!isApproved(canonicalPath, approvedRoots)) {
          result.issues.push({ kind: "symlink-escape", path: logicalPath });
          continue;
        }
        await walkDirectory(logicalPath, canonicalPath, depth + 1);
        continue;
      }

      if (entry.isFile()) {
        const canonicalPath = await realpath(logicalPath).catch(() => logicalPath);
        if (!seenFiles.has(canonicalPath)) {
          seenFiles.add(canonicalPath);
          result.files.push({ logicalPath, realPath: canonicalPath });
        }
        continue;
      }

      const info = await lstat(logicalPath).catch(() => null);
      if (info?.isFile()) {
        const canonicalPath = await realpath(logicalPath).catch(() => logicalPath);
        if (!seenFiles.has(canonicalPath)) {
          seenFiles.add(canonicalPath);
          result.files.push({ logicalPath, realPath: canonicalPath });
        }
      }
    }
  }

  await walkDirectory(logicalRoot, canonicalRoot, 0);
  return result;
}
