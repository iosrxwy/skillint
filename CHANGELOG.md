# Changelog

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
