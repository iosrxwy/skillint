# Changelog

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
