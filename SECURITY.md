# Security Policy

## Supported versions

The `main` branch and the latest tagged release are supported.

## Reporting a vulnerability

Please use [GitHub Security Advisories](https://github.com/iosrxwy/skillint/security/advisories/new) for this repository.

Do not file a public issue for a security report. Include the affected command, a minimal reproduction, and impact.

This project is a static analyzer by default. It reads local Markdown/YAML skill files and does not execute them. No command ever deletes files: `prune --apply`, `trash`, and `link --apply` move items into `~/.skillint/trash/<timestamp>/` with a manifest, and `skillint restore` moves the last batch back. `update --apply` only runs `git pull --ff-only` on git checkouts that are behind.
