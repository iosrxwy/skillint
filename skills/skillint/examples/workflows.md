# skillint worked workflows

End-to-end sequences for the most common requests. Every mutating step is opt-in (`--apply`) and undoable via `skillint restore`.

## A. Weekly checkup with undoable fixes

Goal: keep the skills folder healthy without risking anything.

```bash
npx skillint                      # guided checkup: scan, plain-language report, numbered fixes
npx skillint fix -g               # dry run: shows recoverable frontmatter, names, descriptions
npx skillint fix -g --apply       # write repairs; originals are quarantined first
npx skillint prune -g             # dry run: duplicates, backups, junk safe to quarantine
npx skillint prune -g --apply     # move safe items into ~/.skillint/trash
npx skillint restore              # regret anything? undo the most recent trash batch
```

Report back: skill count, health score before/after, metadata tokens, full-body tokens, always-on rule tokens. Nothing was deleted — everything applied lives in `~/.skillint/trash` until the user empties it.

## B. Vet a repository before `npx skills add`

Goal: never install skill markdown blind.

```bash
npx skillint scan-remote owner/repo             # verdict: clean / caution / risky
npx skillint scan-remote owner/repo --json      # machine-readable findings
```

- Shallow-clones to a cache and pattern-scans every SKILL.md plus shell scripts and instruction files; nothing from the repo is executed.
- `risky` exits 1, so the same command gates CI.
- If the verdict is clean, install, then confirm the local state: `npx skillint audit -g`.
- Findings map to the [security rule catalog](../references/security-rules.md).

## C. CI gating

Goal: fail the build when skill quality or security regresses.

```yaml
# GitHub Action (annotations on PRs come for free)
- uses: iosrxwy/skillint@main
  with:
    fail-on: error
```

Or raw commands in any CI:

```bash
npx skillint doctor ./skills --fail-on error     # exit 1 on any error-level finding
npx skillint doctor ./skills --fail-under 80     # exit 1 when health score < 80
npx skillint audit ./skills --fail-on error      # exit 1 on error-level security finding
npx skillint report --out skillint-report.md -p  # artifact for the build
```

Add `--annotate` to surface findings as GitHub workflow annotations. Shared ignores and thresholds belong in `skillint.config.json` so the whole team gates on the same rules.

## D. Cross-agent dedupe with link

Goal: the same skill is installed in Cursor, Claude Code, Codex, and Grok — share one copy instead of deleting.

```bash
npx skillint link -g              # dry run: lists identical copies and the planned canonical
npx skillint link -g --apply      # replace identical copies with symlinks to the canonical copy
npx skillint adopt -g             # fingerprint-match orphan skills to known public repos
npx skillint update -g            # check git checkouts + adopted skills for upstream updates
npx skillint update -g --apply    # batch-update what is behind (old versions are quarantined)
```

- `link` keeps one canonical copy (preferring `~/.agents/skills`) and points the other agent directories at it. Identical copies must never be deleted.
- `adopt` records provenance for marketplace copies so `update` can batch-check them; name-only matches are listed for human review, never auto-updated.
- Any applied update quarantines the previous version, so `skillint restore` still undoes it.
