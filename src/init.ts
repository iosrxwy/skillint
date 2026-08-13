import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX = 64;

export interface InitOptions {
  name: string;
  dir?: string;
  description?: string;
  cwd?: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function template(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
---

# ${name}

## When to use

Explain the trigger conditions in one or two sentences.

## Steps

1. Replace these steps with the actual procedure.
2. Keep the body focused; link out instead of pasting long reference text.

## Notes

- Keep the body under 4,000 tokens so agents can load it in one turn.
`;
}

export async function scaffoldSkill(options: InitOptions): Promise<{ path: string }> {
  const name = options.name.trim();
  if (name.length > SKILL_NAME_MAX) {
    throw new Error(`Skill name is ${name.length} chars (limit ${SKILL_NAME_MAX})`);
  }
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error(`Skill name "${name}" must be lowercase letters, digits, and hyphens (e.g. code-review)`);
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const dir = join(cwd, options.dir ?? "skills", name);
  const file = join(dir, "SKILL.md");
  if (await exists(file)) {
    throw new Error(`${file} already exists. skillint never overwrites files.`);
  }

  const description =
    options.description?.trim() ||
    `Describe when an agent should load ${name} and what it does. Keep it third person and specific.`;

  await mkdir(dir, { recursive: true });
  await writeFile(file, template(name, description), { encoding: "utf8", flag: "wx" });
  return { path: file };
}
