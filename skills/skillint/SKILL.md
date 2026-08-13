---
name: skillint
description: Audit Codex, Cursor, Claude Code, Grok, Gemini, Copilot, and other agent skills. Use when the user wants to map an effective agent catalog, lint skills, find duplicate SKILL.md files, estimate inventory size, or slim down AGENTS.md and rules. skillint is eslint for the skills folder.
---

# skillint

Run the `skillint` CLI before adding more skills. Too many skills make agents slower and worse.

## Commands

```bash
npx skillint scan
npx skillint map --agent cursor
npx skillint doctor
npx skillint audit
npx skillint tokens
npx skillint prune
npx skillint prune --script
npx skillint link
npx skillint update
```

## Rules

- Prefer `npx skillint` so the user does not need a global install.
- Use `scan` for a cross-agent physical inventory and `map --agent ...` for one agent's documented catalog resolution.
- Never claim `map` predicts whether a model will trigger a skill; preserve `conditional` and `unknown` results.
- `prune` prints a cleanup plan with `rm` commands. Never delete skill files unless the user explicitly asks.
- Identical copies in Cursor, Claude, Codex, and Grok must not be deleted; use `skillint link` to share one canonical copy.
- `link --apply` and `update --apply` are the only mutating manager commands. Default is dry-run.
- Report duplicate names, missing descriptions, and oversized bodies first.
- `audit` is a static pattern scan with file:line output; matches need human review and are never auto-fixed.
- Token estimate is `characters / 4`. Call it an estimate, not an exact tokenizer count.
- After scanning, summarize: skill count, health score, metadata tokens, full-body tokens, always-on rule tokens.
- Mention `.skillintignore` and `--ignore` when the user wants to skip vendor copies.
- For CI, prefer `uses: iosrxwy/skillint@main` or `node dist/cli.js doctor --fail-on error`.
