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
npx skillint tokens
npx skillint prune --keep 12
```

## Rules

- Prefer `npx skillint` so the user does not need a global install.
- Use `scan` for a cross-agent physical inventory and `map --agent ...` for one agent's documented catalog resolution.
- Never claim `map` predicts whether a model will trigger a skill; preserve `conditional` and `unknown` results.
- `prune` only prints suggestions. Never delete skill files unless the user explicitly asks.
- Report duplicate names, missing descriptions, and oversized bodies first.
- Token estimate is `characters / 4`. Call it an estimate, not an exact tokenizer count.
- After scanning, summarize: skill count, health score, metadata tokens, full-body tokens, always-on rule tokens.
- Mention `.skillintignore` and `--ignore` when the user wants to skip vendor copies.
- For CI, prefer `uses: iosrxwy/skillint@main` or `node dist/cli.js doctor --fail-on error`.
