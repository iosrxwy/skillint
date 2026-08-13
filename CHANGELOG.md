# Changelog

## 0.16.0 — 2026-08-13

- Add `skillint scan-remote <owner/repo>`: audit a public skill repository before installing it — shallow clone, pattern scan, verdict with file:line receipts, exit 1 on risky
- Add the Skill Security Observatory: `OBSERVATORY.md` tracks popular skill repos and refreshes weekly via GitHub Actions
- Add `skillint mcp`: a zero-dependency MCP stdio server exposing `skill_checkup`, `skill_audit`, `skill_cleanup_plan`, and `scan_skill_repo` to Claude Code, Cursor, and any MCP client
- Add `skillint roast`: a localized, read-only roast of your skills folder with a shareable SVG card (`--card`)
- Add GitHub repository topics and a star-history section for discoverability

## 0.15.0 — 2026-08-13

- Add `skillint adopt`: fingerprint-match orphan skills against known public repos (Anthropic, Vercel, superpowers) and record their provenance
- Teach `skillint update` to batch-check and batch-update adopted skills (`--apply` is quarantine-backed and undoable)
- Add `skillint fix`: resurrect dead skills — recover frontmatter written without `---` markers, normalize `--- ` delimiters with trailing spaces, and draft missing names/descriptions from the body
- Tolerate trailing whitespace after frontmatter delimiters across the whole engine; on a real machine this alone revived 8 "broken" skills and raised the health score from 10 to 42
- Add `skillint report --html`: a self-contained, zero-dependency HTML dashboard with health gauge, per-source bars, and filterable findings/security/cleanup tables
- Add `skillint badge`: a shields-style SVG health badge for READMEs and dotfiles

## 0.14.0 — 2026-08-13

- Make the checkup report concrete: named examples per category, security hits with file:line excerpts, wasted-token totals, and a full-context-window equivalence
- Collapse the menu into one-key "fix everything safe" (trash junk + share copies in a single undoable step)
- Show the health score before → after every fix, then point at `skillint restore`
- Add checkup screenshots to the README (English and Chinese)

## 0.13.0 — 2026-08-13

- Make bare `skillint` a guided checkup: scan, explain problems in plain language, then offer numbered one-key fixes
- Speak the user's language: the checkup localizes to Chinese when the shell locale is zh
- Offer safe actions only — recycle-bin cleanup, security findings, symlink sharing, or the interactive UI — every write undoable
- Keep CI behavior stable: without a TTY, bare `skillint` prints the classic scan inventory
- `skillint scan` is unchanged; the checkup is only the new default for humans

## 0.12.0 — 2026-08-13

- Remove `rm -rf` from every suggestion: cleanup now quarantines into `~/.skillint/trash/<timestamp>/` with a manifest
- Add `skillint trash <paths...>` and `skillint restore` to move items out and back with one command
- Add `skillint prune --apply` to quarantine all safe items at once, always undoable
- Make `link --apply` quarantine the replaced copy instead of deleting it before creating the symlink
- Redesign the TUI: health bar header, tab pills, severity glyphs, calmer per-column colors, boxed detail pane, cyan copyable commands

## 0.11.0 — 2026-08-13

- Add `skillint ui`: a lazygit-style interactive terminal UI over the whole engine
- Five tabs — issues, audit, cleanup, links, largest — with live counts and per-row detail
- Navigate with 1-5/j/k/g/G, copy the suggested command for any row with `c`, rescan with `r`
- Zero new dependencies: rendered with ANSI escapes and node:readline, TTY required
- Keep the UI read-only; commands are copied to the clipboard, never executed

## 0.10.0 — 2026-08-13

- Add `skillint audit`: a read-only supply-chain scan of installed skills for `curl | bash`, leaked tokens, prompt injection, permission bypass, exfiltration wording, and destructive commands, with file:line output and CI gating via `--fail-on`
- Make `skillint prune` a real cleanup plan: safe / review buckets with `rm` commands
- Add `skillint prune --script` for a reviewable shell script of safe deletions
- Stop treating `--keep 20` as the default prune cut, which previously marked almost every unique skill as droppable
- Keep identical Cursor/Claude/Codex/Grok copies instead of suggesting they be deleted
- Add `skillint link` to share one canonical copy across agents with symlinks (`--apply` writes links)
- Add `skillint update` to check git-backed skills (`--apply` runs `git pull --ff-only`)
- Recognize skills installed by the `skills` CLI via `.agents` lockfiles and point updates at `npx skills update <name>`
- Include the cleanup plan and security audit in Markdown reports, and emit line-level GitHub annotations for audit findings

## 0.9.1 — 2026-08-13

- Replace the dark README artwork with a light, accessible visual system
- Add dedicated diagrams for per-agent catalog mapping and physical inventory
- Refresh the real-world scan example with current results from 1,658 installed skills

## 0.9.0 — 2026-08-13

- Add `skillint map [cwd] --agent cursor|claude|codex` with text output and schema-versioned JSON
- Model documented native, shared, compatibility, user, project, and directory resource scopes without predicting model triggering
- Report effective, coexisting, shadowed, conditional, and unknown resources, including explicit managed/configuration limitations
- Fix false rule classification for `rules/`, `prompts/`, `references/AGENTS.md`, and other support files inside skill packages
- Add bounded realpath-aware catalog walking with cycle prevention, depth/directory limits, and guarded symlink traversal
- Correct Cursor `.mdc`, Claude `CLAUDE.md`/rules/skill precedence, and Codex `.agents/skills`/`AGENTS.override.md` semantics
- Label broad `scan` output as a physical inventory estimate rather than an effective agent catalog
- Raise the runtime baseline to Node.js 22.12 so it matches Commander 15 and supported CI runtimes

## 0.8.0 — 2026-08-13

- Detect missing, unclosed, and invalid YAML frontmatter instead of silently inferring valid metadata
- Fix `missing-name` so it checks the declared frontmatter field rather than the inferred folder name
- Stop requiring frontmatter descriptions on plain `AGENTS.md`-style instruction files
- Avoid false duplicate-content warnings for files whose reads are capped at 512KB
- Validate `--fail-on`, `--fail-under`, `--max`, and `--keep` instead of silently accepting typos
- Ship a JSON Schema for `skillint.config.json` and reject unknown configuration keys
- Smoke-test the packed CLI in CI and enable Dependabot for npm and GitHub Actions
- Remove the install-time lifecycle script so registry installs are script-free
- Document the published npm install path (`npx skillint`)

## 0.7.0 — 2026-08-13

- Add `skillint init <name>` to scaffold a SKILL.md that passes doctor out of the box
- Check skill names against the spec: lowercase letters, digits, hyphens, max 64 chars
- Support `skillint.config.json` for shared ignore patterns and custom doctor limits
- Add `--fail-under <score>` (and a matching Action input) to gate CI on the health score

## 0.6.0 — 2026-08-13

- Scan catalogs in parallel and skip extra `stat` calls, so large skill libraries finish faster
- Treat the same skill installed in Cursor and Claude as a synced copy (info), not a duplicate error
- Warn when one catalog stores the same body under different names
- Print GitHub workflow annotations from `doctor` / `scan` in Actions (and via `--annotate`)
- Show scan duration; cap reads of huge files at 512KB
- Let the GitHub Action take comma-separated `ignore` patterns

## 0.5.0 — 2026-08-13

- Add a health bar to `scan` and `doctor`
- Write a compact summary to GitHub Actions job summaries
- Build from a git checkout on `npm install` so `npx skillint` works after clone
- Add logo, social card, hero art, and a terminal screenshot for the README

## 0.4.0 — 2026-08-13

- Discover Grok, Gemini, Copilot, OpenCode, Windsurf, Kiro, Cline, Continue, Antigravity, Factory, OpenClaw, Hermes, Qoder, CodeBuddy, Goose, Amp, Roo, Trae, Crush, Pi, and cc-switch skill folders
- Follow skill directory symlinks (Grok often links into `~/.agents/skills`)
- Read extra project instruction files: `GROK.md`, `CODEX.md`, `COPILOT.md`, `WINDSURF.md`, `OPENCODE.md`, `KIRO.md`, `.windsurfrules`, `.clinerules`

## 0.3.0 — 2026-08-13

- Add a catalog health score (0–100) on `scan` and in reports
- Group duplicate-name findings instead of repeating every copy
- Detect short descriptions, first-person descriptions, and oversized AGENTS.md
- Support `.skillintignore` and repeatable `--ignore`
- Ship a composite GitHub Action: `uses: iosrxwy/skillint@main`
- Add SECURITY.md and a short code of conduct
- Cap noisy doctor/prune terminal output; full lists remain available via `--json`

## 0.2.0 — 2026-08-13

- Add `skillint report` to write a Markdown audit for CI and maintainer review
- Make `scan` the default command
- Add localized project introductions: zh-CN, zh-TW, ja, ko, es, fr, de, pt-BR, ru
- Dogfood `doctor` on `./skills` in GitHub Actions

## 0.1.0 — 2026-08-13

- Initial public release: `scan`, `doctor`, `tokens`, `prune`
- Discover Codex, Cursor, Claude Code, and project-level agent files
