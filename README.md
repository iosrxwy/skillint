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

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/iosrxwy/skillint@main/docs/logo.png" width="120" height="120" alt="skillint">
</p>

<h1 align="center">skillint</h1>

<p align="center"><b>eslint for <code>SKILL.md</code></b></p>

<p align="center">
  Audit <code>SKILL.md</code>, <code>AGENTS.md</code>, and editor rules used by
  <b>Codex</b>, <b>Cursor</b>, <b>Claude Code</b>, <b>Grok</b>, <b>Gemini</b>, <b>Copilot</b>, and other agents.
  Separate copied installs from real conflicts, diagnose broken metadata, and estimate catalog size before it becomes agent context.
</p>

<p align="center">
  <a href="https://github.com/iosrxwy/skillint/actions/workflows/ci.yml"><img src="https://github.com/iosrxwy/skillint/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/skillint"><img src="https://img.shields.io/npm/v/skillint" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <a href="https://github.com/iosrxwy/skillint/issues"><img src="https://img.shields.io/github/issues/iosrxwy/skillint" alt="issues"></a>
  <a href="https://github.com/iosrxwy/skillint/stargazers"><img src="https://img.shields.io/github/stars/iosrxwy/skillint?style=social" alt="stars"></a>
</p>

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/iosrxwy/skillint@main/docs/social.svg" alt="skillint — static analysis for AI agent skills" width="720">
</p>

```bash
npx skillint
```

This runs the default local scan. The audit path is static and read-only: scanned skills are parsed as text and never executed. `scan`, `doctor`, `tokens`, and `prune` do not modify the catalog; `report` writes only the output file you request.

## What it solves

- **Catalog sprawl** — inventory global and project skills and rules across Codex, Cursor, Claude Code, Grok, Gemini, Copilot, OpenCode, Windsurf, Kiro, Cline, and more
- **Duplicate noise** — report cross-agent installs as `synced-copy` info while keeping same-agent-family name collisions as errors
- **Broken skill specs** — diagnose missing, unclosed, or invalid YAML frontmatter; required fields; naming issues; oversized bodies; and long instruction files
- **Unknown context size** — compare metadata and body size using explicit estimates (`characters / 4`), not exact tokenizer cost or a claim about what any model loaded
- **CI drift** — emit GitHub Action annotations and summaries, write Markdown/JSON reports, and enforce `--fail-on`, `--fail-under`, or shared config thresholds
- **Fast local scan** — use concurrent, bounded reads, follow symlinked skill roots without loops, and scaffold a valid starter with `skillint init`

---

## Why this exists

Coding agents can discover instructions from many global and project directories. Once those directories accumulate copies, the catalog becomes hard to reason about:

- the same skill copied across several agents makes inventory noisy
- duplicate names inside one agent family create real ambiguity
- malformed or missing metadata makes skill discovery unreliable
- oversized bodies and always-on rules hide potential context cost

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/iosrxwy/skillint@main/docs/hero.svg" alt="Agent skill catalog analyzed into an actionable read-only audit" width="720">
</p>

`skillint` turns those directories into an actionable audit: inventory, diagnostics, a 0–100 health score, estimated size, and a ranked prune plan without deleting anything.

## Install

Requires Node.js 18.18 or later.

```bash
npx skillint scan
```

No global install is required. To keep the command on your PATH:

```bash
npm install --global skillint
skillint scan
```

## Quick start

```bash
npx skillint scan                 # inventory + estimated size + health bar
npx skillint doctor               # diagnostics
npx skillint init code-review     # scaffold a SKILL.md that passes doctor
npx skillint tokens               # compact estimates
npx skillint prune --keep 12      # suggestions only
npx skillint report --out out.md  # Markdown audit
```

Scope control:

```bash
npx skillint scan -g              # user-level dirs only
npx skillint scan -p              # current project only
npx skillint doctor ./skills      # one directory
npx skillint doctor --json --fail-on error
npx skillint doctor --fail-under 80   # fail CI when health drops below 80
```

Audit commands never mutate or delete scanned skill files. `report` creates only the requested report, and `init` never overwrites an existing `SKILL.md`.

## Example

From a developer machine with a large local skill library:

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/iosrxwy/skillint@main/docs/scan.svg" alt="skillint scan showing 1,553 skills and an estimated 3.3 million body tokens" width="720">
</p>

`skillint doctor` on the same machine: **233 findings** (60 duplicate names, 152 oversized files, 20 missing descriptions).

The ~3.3M-token figure is a sizing estimate for the discovered files, not a claim that any agent loads the entire catalog.

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

Findings show up as pull request annotations. Copies of the same skill across Cursor, Claude, Grok, and other agents are reported as info (`synced-copy`), not as CI-failing duplicates.

## Ignore patterns

Create `.skillintignore` in the working directory, or pass `--ignore`:

```bash
skillint doctor --ignore vendor --ignore "*.bak"
```

## Configuration

Put a `skillint.config.json` next to where you run skillint to share ignore patterns and tune the doctor limits:

```json
{
  "$schema": "https://unpkg.com/skillint@latest/skillint.schema.json",
  "ignore": ["vendor", "*.bak"],
  "limits": {
    "skillBodyTokens": 3000,
    "descriptionMin": 60
  }
}
```

The schema provides editor completion and catches misspelled settings. Available limits: `skillBodyTokens` (4000), `ruleAlwaysOnTokens` (800), `descriptionMax` (1024), `descriptionMin` (40), `agentsDocLines` (100), `nameMax` (64).

## How it works

```mermaid
flowchart LR
  A[Skill folders] --> B[discover]
  B --> C[doctor]
  C --> D[health score]
  C --> E[report / JSON / CI]
  B --> F[token budget]
```

Audit commands never execute scanned skills or modify the catalog. `init` creates a new skill, and `report` writes only the report path you request.

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
