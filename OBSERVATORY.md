# Skill Security Observatory

Generated 2026-08-13 by [`skillint scan-remote`](https://github.com/iosrxwy/skillint). Static pattern scan of public skill repositories — nothing is executed, and a finding is a *lead to review*, not a conviction. Install instructions inside a skill (e.g. `curl | bash`) are exactly what an agent may run on your machine.

| Repository | Verdict | Skills | High-risk | Warnings | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| [obra/superpowers](https://github.com/obra/superpowers) | 🟡 caution | 14 | 0 | 10 | `permission-bypass` explicit-skill-requests:28 |
| [anthropics/skills](https://github.com/anthropics/skills) | 🟢 clean | 18 | 0 | 0 | no dangerous patterns |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 🟢 clean | 9 | 0 | 0 | no dangerous patterns |

Run it yourself before installing anything:

```bash
npx skillint scan-remote owner/repo
```
