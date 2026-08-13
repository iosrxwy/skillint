---
name: skillint
description: Audit, lint, and secure AI agent skills across Codex, Cursor, Claude Code, Grok, Gemini, Copilot, and more. Use when the user wants to check skill health, find duplicate or oversized SKILL.md files, security-scan installed skills, vet a skill repo before installing, clean up safely with undo, or estimate the token cost of an agent catalog. skillint is eslint for the skills folder.
license: MIT
---

# skillint

Static analysis for agent skills. Run it before adding more skills — too many skills make agents slower and worse. Scanning and auditing are read-only; every write requires an explicit `--apply` and is quarantine-based and undoable.

## When to use

- The user asks "how healthy are my skills", "why is my agent slow", or wants a cross-agent inventory.
- Before installing a skill repository (`npx skills add ...`) — vet it first.
- The user wants to clean up, dedupe, repair, or shrink their skills folder without risk.
- CI needs to gate on skill quality or security.

## Quick start — the 5 commands that cover most requests

```bash
npx skillint                         # guided checkup: scan, explain, offer numbered undoable fixes
npx skillint scan -g                 # cross-agent physical inventory with token estimates
npx skillint doctor -g               # lint: duplicates, missing metadata, oversized bodies
npx skillint audit -g                # security scan for dangerous patterns (read-only)
npx skillint scan-remote owner/repo  # vet a public skill repo BEFORE installing
```

Prefer `npx skillint` so the user does not need a global install. `-g` includes user-level agent directories; `-p` includes the current project. Mention `.skillintignore` and `--ignore` when the user wants to skip vendor copies.

## Ground rules

- `scan` is a physical inventory; `map --agent cursor|claude|codex` resolves one agent's documented catalog. Never claim `map` predicts whether a model will trigger a skill; preserve `conditional` and `unknown` results.
- skillint never deletes. `prune --apply` and `trash` quarantine into `~/.skillint/trash`; `restore` undoes the last batch. Never use raw `rm` on skills.
- Identical copies across Cursor, Claude, Codex, and Grok must not be deleted; share one canonical copy with `skillint link --apply`.
- `audit` is a static pattern scan with file:line receipts. Matches are leads for human review, never auto-fixed, and nothing from scanned files is executed.
- Token numbers are estimates (`characters / 4`), not exact tokenizer counts.
- After scanning, summarize: skill count, health score, metadata tokens, full-body tokens, always-on rule tokens.

## Reference files — load on demand

- [Command reference](./references/commands.md) — every command (scan, map, doctor, audit, ui, tokens, prune, trash, restore, link, adopt, update, fix, scan-remote, mcp, roast, badge, report, init) with accurate flags and examples. Load when exact flags matter.
- [Security rule catalog](./references/security-rules.md) — the audit rules (remote-exec, eval-remote, credential, sensitive-file, prompt-injection, exfiltration, permission-bypass, destructive, obfuscation), what each flags, and severities. Load when explaining audit findings.
- [MCP setup](./references/mcp-setup.md) — register `skillint mcp` in Cursor, Claude Code, or Codex, plus the 4 exposed tools. Load when the user wants skillint as a native agent tool.
- [Worked workflows](./examples/workflows.md) — end-to-end examples: weekly checkup with undoable fixes, pre-install repo vetting, CI gating, cross-agent dedupe. Load when orchestrating a multi-step task.
