# skillint security rule catalog

`skillint audit` (and `scan-remote`, and the MCP `skill_audit` tool) run a static pattern scan over installed skill text. Nothing is executed, nothing is modified, and matches are leads for human review — never convictions and never auto-fixed. Every finding includes `path:line` and a trimmed excerpt.

## Rules

| Code | Severity | What it flags |
| --- | --- | --- |
| `remote-exec` | error | Downloads piped straight into a shell: `curl \| bash`, `wget \| sh` (also zsh/dash/fish, with optional `sudo`/`env`), and PowerShell `iwr`/`irm`/`Invoke-WebRequest`/`Invoke-RestMethod` piped to `iex` |
| `eval-remote` | warning | Evaluating a script fetched from the network: `eval "$(curl ...)"`, `source <(curl ...)`, `bash <(wget ...)` |
| `credential` | error | Real-looking secrets: AWS access key IDs (`AKIA...`), GitHub tokens (`ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`), API secret keys (`sk-`, `sk-proj-`, `sk-ant-`, `sk-or-v1-`), Stripe live keys (`sk_live_`), Slack tokens (`xoxb-`/`xoxa-`/`xoxp-`/`xoxr-`/`xoxs-`), and embedded `PRIVATE KEY` blocks |
| `credential` | info | Hardcoded credential-style assignments like `password = "..."` or `api_key: "..."` — often a docs example, so reported at info |
| `sensitive-file` | warning | References to credential or key files on disk: `~/.ssh`, `.ssh/id_*`, `.aws/credentials`, `/etc/passwd`, `/etc/shadow`, `.netrc`, macOS `security find-generic-password` / `find-internet-password` |
| `prompt-injection` | warning | Instructions that override agent behavior or hide actions: "ignore previous instructions", "disregard prior rules", "do not tell the user", "without informing the user", "hide this from the user", "keep this secret from the user" |
| `exfiltration` | warning | Instructions to transmit secrets over the network: a send/post/upload/forward/transmit/exfiltrate/share verb on the same line as secrets vocabulary (`.env`, credentials, tokens, API keys, passwords, private keys, environment variables) plus a URL, webhook, endpoint, or remote server |
| `permission-bypass` | warning | Flags that bypass permission prompts or sandboxing: `--dangerously-skip-permissions`, `--yolo`, `--trust-all-tools`, `--no-sandbox`, `--allow-all` |
| `destructive` | warning | Destructive filesystem commands targeting home or root (`rm -rf /`, `rm -rf ~`, `rm -rf "$HOME"`) and fork bombs |
| `obfuscation` | info | Long base64-like blobs (300+ characters) that could hide an obfuscated payload |

## False-positive controls

- Credential rules skip obvious placeholders: strings containing `example`, `sample`, `your`, `xxxx`, `<...>`, `changeme`, `redacted`, etc., or with fewer than 6 distinct characters, are not reported.
- At most 3 matches per rule per file, so one noisy file cannot flood the report.
- Only the first 512 KB of each file is scanned.
- Findings are sorted error → warning → info, then by path and line.

## Interpreting severities

- **error** — treat as a blocker: install pipes and live credentials should be removed or justified before the skill is trusted.
- **warning** — needs human judgment: a security-testing skill may legitimately mention `~/.ssh`; a novel-writing skill should not.
- **info** — context for review, not a defect on its own.

Gate CI with `skillint audit --fail-on error` (default) or tighten to `--fail-on warning`.
