---
name: skillint
description: Audit Codex, Cursor, and Claude Code agent skills. Use when the user wants to lint skills, find duplicate SKILL.md files, estimate context tokens, or slim down AGENTS.md and rules.
---

# skillint

Run the `skillint` CLI before adding more skills. Too many skills make agents slower and worse.

## Commands

```bash
npx skillint scan
npx skillint doctor
npx skillint tokens
npx skillint prune --keep 12
```

## Rules

- Prefer `npx skillint` so the user does not need a global install.
- `prune` only prints suggestions. Never delete skill files unless the user explicitly asks.
- Report duplicate names, missing descriptions, and oversized bodies first.
- Token estimate is `characters / 4`. Call it an estimate, not an exact tokenizer count.
- After scanning, summarize: skill count, metadata tokens, full-body tokens, always-on rule tokens.
