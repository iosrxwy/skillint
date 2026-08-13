<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.ko.md">한국어</a> ·
  <a href="./README.es.md">Español</a> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.de.md">Deutsch</a> ·
  <a href="./README.pt-BR.md">Português</a> ·
  <a href="./README.ru.md">Русский</a>
</p>

<h1 align="center">skillint</h1>

<p align="center"><b>Static analysis for AI agent skills.</b></p>

<p align="center">
  Audit <code>SKILL.md</code>, <code>AGENTS.md</code>, and editor rules used by
  <b>Codex</b>, <b>Cursor</b>, <b>Claude Code</b>, <b>Grok</b>, <b>Gemini</b>, <b>Copilot</b>, and other agents.
  Find duplicates, missing metadata, and context bloat before they land in the prompt.
</p>

<p align="center">
  <a href="https://github.com/iosrxwy/skillint/actions/workflows/ci.yml"><img src="https://github.com/iosrxwy/skillint/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <a href="https://github.com/iosrxwy/skillint/issues"><img src="https://img.shields.io/github/issues/iosrxwy/skillint" alt="issues"></a>
  <a href="https://github.com/iosrxwy/skillint/stargazers"><img src="https://img.shields.io/github/stars/iosrxwy/skillint?style=social" alt="stars"></a>
</p>

---

## Why this exists

Coding agents no longer read one system prompt. They load a catalog of skills on demand.

That catalog only works when it is **small, named, and described**. A workstation that copied hundreds of skills will:

- spend thousands of tokens on metadata before any real work starts
- hide the useful skill behind three near-identical copies
- inject 10k-token bodies into a single turn
- fail silently when `description` is missing, so the skill never gets selected

`skillint` is the linter for that folder. It does not execute skills. It does not delete files. It reports what an agent would have to carry.

## Features

- **Inventory** — discover skills and rules across Codex, Cursor, Claude Code, Grok, Gemini, Copilot, and project roots
- **Health score** — 0–100 catalog score from doctor findings and catalog size
- **Token budget** — estimate metadata cost vs full-body cost (`characters / 4`)
- **Doctor** — duplicates, missing/short/first-person descriptions, oversized files, long AGENTS.md
- **Prune plan** — ranked keep/drop suggestions; never mutates the filesystem
- **Markdown report** — CI-friendly artifact for pull requests and maintainer review
- **GitHub Action** — `uses: iosrxwy/skillint@main` on any public repo
- **JSON output** — every command supports `--json`

## Install

Requires Node.js 18.18 or later.

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint
npm install
npm run build
node dist/cli.js scan
```

After a global link:

```bash
npm link
skillint scan
```

## Quick start

```bash
skillint scan                 # inventory + token budget
skillint doctor               # diagnostics
skillint tokens               # compact numbers
skillint prune --keep 12      # suggestions only
skillint report --out out.md  # markdown audit
```

Scope control:

```bash
skillint scan -g              # user-level dirs only
skillint scan -p              # current project only
skillint doctor ./skills      # one directory
skillint doctor --json --fail-on error
```

`prune` and `report` are read-only. skillint never deletes a skill file.

## Example

From a developer machine with a large local skill library:

```text
skillint scan

6 roots · 1,553 skills · 10 rules
health 0/100  critical

Context cost
  metadata (name + description):  ~68,792 tokens
  all bodies if fully loaded:     ~3,344,017 tokens
```

`skillint doctor` on the same machine: **233 findings** (60 duplicate names, 152 oversized files, 20 missing descriptions).

An agent does not need three million tokens of skills.

## What it scans

| Agent | Global | Project |
| --- | --- | --- |
| Cursor | `~/.cursor/skills`, `~/.cursor/rules` | `.cursor/skills`, `.cursor/rules` |
| Claude Code | `~/.claude/skills`, `~/.claude/rules` | `.claude/skills`, `.claude/rules` |
| Codex | `~/.codex/skills`, `~/.codex/rules`, `~/.codex/prompts` | `.codex/skills`, `.codex/rules`, `.codex/prompts` |
| Grok | `~/.grok/skills`, `~/.grok/plugins` | `.grok/skills`, `.grok/plugins` |
| Gemini / Antigravity | `~/.gemini/skills`, `~/.antigravity/skills` | `.gemini/skills`, `.antigravity/skills` |
| GitHub Copilot | `~/.copilot/skills` | `.github/skills`, `.github/agents`, `.github/instructions` |
| OpenCode | `~/.config/opencode/skills` | `.opencode/skills` |
| Windsurf | `~/.codeium/windsurf/skills`, `~/.windsurf/skills` | `.windsurf/skills` |
| Kiro | `~/.kiro/skills`, `~/.kiro/steering` | `.kiro/skills`, `.kiro/steering` |
| Cline / Continue | `~/.cline/skills`, `~/.continue/skills` | `.cline/skills`, `.continue/skills` |
| Shared agents | `~/.agents/skills` | `.agents/skills`, `skills/` |
| Others | Factory, OpenClaw, Hermes, Qoder, CodeBuddy, Goose, Amp, Roo, Trae, Crush, Pi, cc-switch | matching `.tool/skills` folders |

Also reads project instruction files: `AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `GEMINI.md`, `GROK.md`, `CODEX.md`, `COPILOT.md`, `WINDSURF.md`, `OPENCODE.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `.github/copilot-instructions.md`.

Token counts are **estimates**, not a vendor tokenizer. Use them to compare size, not to bill APIs.

## GitHub Action

```yaml
name: skillint
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: iosrxwy/skillint@main
        with:
          fail-on: error
```

## Ignore patterns

Create `.skillintignore` in the working directory, or pass `--ignore`:

```bash
skillint doctor --ignore vendor --ignore "*.bak"
```

## How it works

```mermaid
flowchart LR
  A[Skill folders] --> B[discover]
  B --> C[doctor]
  C --> D[health score]
  C --> E[report / JSON / CI]
  B --> F[token budget]
```

skillint only reads files. It never executes a skill and never deletes one.

## CI

```yaml
- run: node dist/cli.js doctor ./skills --fail-on error
- run: node dist/cli.js report --out skillint-report.md -p
```

This repository dogfoods `doctor` on `./skills` in GitHub Actions.

## Use it as an agent skill

The repo ships `skills/skillint/SKILL.md`:

```bash
npx skills add iosrxwy/skillint
```

## Development

```bash
npm test
npm run build
node dist/cli.js --help
```

## License

[MIT](./LICENSE) © 2026 [iosrxwy](https://github.com/iosrxwy)
