# skillint MCP setup

`skillint mcp` runs a zero-dependency MCP server over stdio (JSON-RPC, protocol `2025-06-18`), so agents can call skillint as a native tool instead of improvising shell commands.

## Register the server

### Cursor

Add to `~/.cursor/mcp.json` (or the project's `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "skillint": { "command": "npx", "args": ["-y", "skillint", "mcp"] }
  }
}
```

### Claude Code

```bash
claude mcp add skillint -- npx -y skillint mcp
```

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.skillint]
command = "npx"
args = ["-y", "skillint", "mcp"]
```

## Exposed tools

| Tool | Arguments | What it does |
| --- | --- | --- |
| `skill_checkup` | `cwd` (optional) | Scans every installed agent skill and returns a health summary: counts, token estimates, duplicates, and top problems. Read-only. |
| `skill_audit` | `severity` (`error`/`warning`/`info`, default `warning`), `limit` (default 50) | Security-scans every installed skill for dangerous patterns and returns findings with file:line receipts. Read-only. |
| `skill_cleanup_plan` | none | Returns the undoable cleanup plan: duplicates, backups, and junk that are safe to quarantine, with the exact `skillint trash` commands. Never deletes anything itself; undo is always `skillint restore`. |
| `scan_skill_repo` | `repo` (required, `owner/repo` or local path) | Audits a public GitHub skill repository BEFORE installing. Shallow-clones to a cache and pattern-scans — nothing is executed. Returns a verdict: `clean`, `caution`, or `risky`. |

All four tools are read-only. `skill_cleanup_plan` returns commands for the human to run; it performs no writes itself.
