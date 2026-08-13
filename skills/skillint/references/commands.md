# skillint command reference

All flags below come from `skillint --help` and per-command `--help`. Prefer `npx skillint <command>` so no global install is needed.

## Shared flags

Most inventory-based commands (`scan`, `doctor`, `tokens`, `prune`, `audit`, `link`, `update`, `fix`, `roast`, `badge`, `report`) accept:

| Flag | Meaning |
| --- | --- |
| `--json` | Print JSON instead of the human report |
| `-g, --global` | Include user-level dirs for Cursor, Claude, Codex, Grok, Gemini, Copilot, and others |
| `-p, --project` | Include the current project |
| `--ignore <pattern>` | Ignore a path pattern (repeatable); `.skillintignore` and `skillint.config.json` work too |
| `--annotate` | Print GitHub workflow annotations |
| `[paths...]` | Optional extra directories to scan |

Exit codes: `0` success; `1` when `doctor`/`audit` findings reach `--fail-on`, health drops below `--fail-under`, or `scan-remote` returns a risky verdict.

## Checkup and inventory

### `skillint` (bare)

Guided checkup: scans, explains results in plain language, and offers numbered, undoable fixes.

### `skillint scan [paths...]`

Inventory skill/rule files and estimate their size (physical inventory, not effective loading).

```bash
npx skillint scan -g
npx skillint scan -g --json
```

### `skillint tokens [paths...]`

Print a compact token budget (metadata tokens, full-body tokens, always-on rule tokens). Estimates are `characters / 4`.

### `skillint doctor [paths...]`

Find duplicates, missing metadata, and oversized skills.

| Flag | Meaning |
| --- | --- |
| `--fail-on <level>` | Exit 1 on `error`, `warning`, or `none` (default `error`) |
| `--fail-under <score>` | Exit 1 when the health score is below this number (0-100) |
| `--max <n>` | Max detail rows to print (default 40) |

```bash
npx skillint doctor -g
npx skillint doctor ./skills --fail-on error
npx skillint doctor --fail-under 80
```

### `skillint map [cwd]`

Resolve one agent's effective, coexisting, conditional, shadowed, and unknown resources.

| Flag | Meaning |
| --- | --- |
| `--agent <agent>` | Catalog adapter: `cursor`, `claude`, or `codex` |
| `--json` | Print schema-versioned JSON |

```bash
npx skillint map --agent cursor
```

`map` resolves the documented catalog only. It does not predict whether a model will trigger a skill; `conditional` and `unknown` results must be preserved as-is.

## Security

### `skillint audit [paths...]`

Scan installed skills for dangerous patterns. Read-only; nothing is executed. See the [security rule catalog](./security-rules.md).

| Flag | Meaning |
| --- | --- |
| `--fail-on <level>` | Exit 1 on `error`, `warning`, or `none` (default `error`) |
| `--max <n>` | Max detail rows to print (default 40) |

```bash
npx skillint audit -g
npx skillint audit --fail-on error
```

### `skillint scan-remote <repos...>`

Audit public skill repos BEFORE installing (`owner/repo` or a local path). Shallow-clones to a cache and pattern-scans; nothing is executed. Verdicts: `clean`, `caution`, `risky` (exit 1 on risky).

| Flag | Meaning |
| --- | --- |
| `--json` | Print JSON |
| `--markdown <file>` | Write an observatory-style markdown table |
| `--max <n>` | Max findings per repo in text output (default 10) |

```bash
npx skillint scan-remote anthropics/skills vercel-labs/agent-skills
```

### `skillint mcp`

Run skillint as an MCP server (stdio) so agents can call it as a native tool. See [MCP setup](./mcp-setup.md).

## Cleanup — quarantine, never delete

### `skillint prune [paths...]`

Plan a cleanup. Dry run by default.

| Flag | Meaning |
| --- | --- |
| `--keep <n>` | Also suggest dropping unique skills beyond this ranked count |
| `--script` | Print a reviewable shell script of safe trash commands |
| `--apply` | Move all safe items into `~/.skillint/trash` (undo with `skillint restore`) |
| `--max <n>` | Max rows per cleanup section (default 20) |

### `skillint trash <paths...>`

Move files or folders into `~/.skillint/trash`. Undo with `skillint restore`.

### `skillint restore`

Undo the most recent skillint trash batch.

## Skill manager

### `skillint link [paths...]`

Share identical skills across agents with symlinks. Dry run by default; `--apply` replaces identical copies with symlinks to the canonical copy (preferring `~/.agents/skills`). `--max <n>` caps rows (default 20).

### `skillint adopt [paths...]`

Match orphan skills to known public repos so `skillint update` can batch-update them. `--repo <owner/repo>` adds registry repos (repeatable). Name-only matches are listed for human review, never auto-updated.

### `skillint update [paths...]`

Check git-backed and adopted skills for upstream updates. Dry run by default; `--apply` updates checkouts and adopted skills that are behind (undoable for adopted — the old version is quarantined first). `--max <n>` caps rows (default 20).

### `skillint fix [paths...]`

Repair skills with missing frontmatter, names, or descriptions. Dry run by default; `--apply` writes repairs and sends the originals to `~/.skillint/trash` first.

## Authoring and reporting

### `skillint init <name>`

Scaffold a new SKILL.md that passes doctor. Never overwrites files. `-d, --dir <dir>` sets the parent directory (default `skills`); `--description <text>` sets the frontmatter description.

### `skillint ui [paths...]`

Interactive read-only terminal UI with five tabs: issues, audit, cleanup, links, largest. Keys: `1-5` switch tabs, `j`/`k` move, `c` copy the suggested command, `r` rescan, `q` quit. Commands are only copied to the clipboard, never executed.

### `skillint report [paths...]`

Write a Markdown audit report. `-o, --out <file>` sets the path (default `skillint-report.md`); `--html [file]` also writes a self-contained HTML dashboard.

### `skillint badge [paths...]`

Write an SVG health badge for the README. `-o, --out <file>` sets the path (default `skills-health.svg`).

### `skillint roast [paths...]`

Roast the skills folder. Read-only, shareable, mildly rude. `--card [file]` also writes a shareable SVG card.

## Configuration

Place `skillint.config.json` in the working directory to share ignores and tune doctor thresholds:

```json
{
  "$schema": "https://unpkg.com/skillint@latest/skillint.schema.json",
  "ignore": ["vendor", "*.bak"],
  "limits": { "skillBodyTokens": 3000, "descriptionMin": 60 }
}
```

Tunable limits (defaults): `skillBodyTokens` (4000), `ruleAlwaysOnTokens` (800), `descriptionMax` (1024), `descriptionMin` (40), `agentsDocLines` (100), `nameMax` (64).
