# skillint

Lint agent skills before they eat your context window.

`skillint` scans `SKILL.md`, `AGENTS.md`, and editor rules used by **Codex**, **Cursor**, and **Claude Code**. It reports duplicates, missing metadata, and how many tokens those files would cost if an agent loaded them.

[![CI](https://github.com/iosrxwy/skillint/actions/workflows/ci.yml/badge.svg)](https://github.com/iosrxwy/skillint/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/skillint.svg)](https://www.npmjs.com/package/skillint)

中文说明见下方。

## Why

Coding agents now load skills on demand. That only works if the catalog is small, named, and described. A machine with hundreds of copied skills will:

- waste tokens on duplicate names
- hide the useful skill behind 20 near-copies
- inject huge always-on rules into every turn

`skillint` is `eslint` for that folder.

## Install

```bash
npx skillint scan
```

Or install globally:

```bash
npm install -g skillint
```

## Commands

```bash
npx skillint scan          # catalog + token budget
npx skillint doctor        # duplicates, missing descriptions, oversized files
npx skillint tokens        # compact numbers
npx skillint prune --keep 12
```

`prune` only prints suggestions. It never deletes files.

Scan a specific directory:

```bash
npx skillint doctor ./skills
npx skillint scan -g       # user-level dirs only: ~/.cursor ~/.claude ~/.codex ~/.agents
```

JSON output is available on every command:

```bash
npx skillint doctor --json
```

## What it scans

| Source | Paths |
| --- | --- |
| Cursor | `~/.cursor/skills`, `.cursor/skills`, `.cursor/rules` |
| Claude | `~/.claude/skills`, `.claude/skills` |
| Codex | `~/.codex/skills`, `.codex/skills` |
| Agents | `~/.agents/skills`, `.agents/skills`, `skills/` |
| Project | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md` |

Token counts are estimates (`characters / 4`), not a vendor tokenizer.

## Example

From a developer machine with a large local skill library:

```text
skillint scan

6 roots · 1,553 skills · 10 rules

Context cost
  metadata (name + description):  ~68,792 tokens
  all bodies if fully loaded:     ~3,344,017 tokens
  always-on rules:                ~0 tokens

By source
  cursor-global     1460 files
  agents-global       69 files
  codex-global        32 files
```

That is the bug. Agents do not need three million tokens of skills.

`skillint doctor` on the same machine found **233 issues**: 60 duplicate names, 152 oversized files, 20 missing descriptions.

## Use it as a skill

This repo includes `skills/skillint/SKILL.md`, so an agent can install it with:

```bash
npx skills add iosrxwy/skillint
```

## License

MIT

---

## 中文

`skillint` 用来检查 Codex / Cursor / Claude Code 的 agent skills：重复名字、缺 description、以及这些文件大概会吃掉多少 context。

```bash
npx skillint scan
npx skillint doctor
npx skillint prune --keep 12
```

`prune` 只给建议，不会删任何文件。
