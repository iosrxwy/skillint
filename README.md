# skillint

**eslint for AI agent skills.**

Codex、Cursor、Claude Code 都会把 `SKILL.md` / `AGENTS.md` 读进上下文。装多了不会更聪明，只会更慢、更贵、更容易选错 skill。

`skillint` 扫描这些文件，告诉你：

- 一共有多少 skill，大概吃掉多少 token
- 哪些重名、缺 description、体积过大
- 如果要精简，建议留哪些（只给建议，不删文件）

[![CI](https://github.com/iosrxwy/skillint/actions/workflows/ci.yml/badge.svg)](https://github.com/iosrxwy/skillint/actions/workflows/ci.yml)

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint && npm install && npm run build
node dist/cli.js scan
```

English version is below the Chinese section.

---

## 它解决什么问题

现在很多人会一键装几十上百个 agent skills。Agent 真正需要的是**短、准、不重复**的目录，不是把整个技能市场塞进 `~/.cursor/skills`。

典型后果：

| 现象 | 影响 |
| --- | --- |
| 同一个 skill 复制了 3 份 | Agent 不知道该用哪一份 |
| 没有 `description` | 不会被按需加载，等于白装 |
| 单个 SKILL.md 上万 token | 一调用就把上下文打满 |
| 全局装了 1000+ 个 skill | 光目录元数据就可能上万 token |

`skillint` 就是给这个目录做体检。

## 快速开始

需要 Node.js 18+。

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint
npm install
npm run build
node dist/cli.js scan
```

常用命令：

```bash
node dist/cli.js scan              # 统计数量和 token
node dist/cli.js doctor            # 查重复、缺字段、过大文件
node dist/cli.js tokens            # 只看数字
node dist/cli.js prune --keep 12   # 给出保留建议，不删除任何文件
```

只扫当前项目：

```bash
node dist/cli.js scan -p
node dist/cli.js doctor ./skills
```

只扫本机全局目录（`~/.cursor`、`~/.claude`、`~/.codex`、`~/.agents`）：

```bash
node dist/cli.js scan -g
```

输出 JSON（方便接 CI 或自己写脚本）：

```bash
node dist/cli.js doctor --json
node dist/cli.js doctor --fail-on error   # 有 error 时退出码为 1
```

## 真实扫描结果

在一台装了大量 skills 的开发机上：

```text
skillint scan

6 roots · 1,553 skills · 10 rules

Context cost
  metadata (name + description):  ~68,792 tokens
  all bodies if fully loaded:     ~3,344,017 tokens

By source
  cursor-global     1460 files
  agents-global       69 files
  codex-global        32 files
```

同一台机器跑 `doctor`：**233 个问题**（60 个重名、152 个过大、20 个缺 description）。

Agent 不需要三百万 token 的 skills。

## 扫描范围

| 工具 | 路径 |
| --- | --- |
| Cursor | `~/.cursor/skills`、`.cursor/skills`、`.cursor/rules` |
| Claude Code | `~/.claude/skills`、`.claude/skills` |
| Codex | `~/.codex/skills`、`.codex/skills` |
| 通用 | `~/.agents/skills`、`.agents/skills`、`skills/` |
| 项目根目录 | `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.cursorrules`、`.github/copilot-instructions.md` |

Token 按 `字符数 / 4` 估算，用来比较体积，不是各家官方 tokenizer。

`prune` **不会删除文件**，只打印建议保留 / 建议拿掉的列表。

## 给 Agent 自己用

仓库里带了 `skills/skillint/SKILL.md`，可以用：

```bash
npx skills add iosrxwy/skillint
```

## 开发

```bash
npm test
npm run build
```

## License

MIT

---

# skillint (English)

Lint `SKILL.md`, `AGENTS.md`, and editor rules used by **Codex**, **Cursor**, and **Claude Code**.

Coding agents load skills on demand. That only works when the catalog is small, named, and described. A machine with hundreds of copied skills will waste tokens, hide the useful skill behind duplicates, and blow the context window.

`skillint` is eslint for that folder.

## Install

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint
npm install
npm run build
node dist/cli.js scan
```

## Commands

```bash
node dist/cli.js scan              # catalog + token budget
node dist/cli.js doctor            # duplicates, missing descriptions, oversized files
node dist/cli.js tokens            # compact numbers
node dist/cli.js prune --keep 12   # suggestions only; never deletes files
```

```bash
node dist/cli.js scan -g           # user-level dirs only
node dist/cli.js scan -p           # current project only
node dist/cli.js doctor --json
node dist/cli.js doctor --fail-on error
```

## What it scans

| Source | Paths |
| --- | --- |
| Cursor | `~/.cursor/skills`, `.cursor/skills`, `.cursor/rules` |
| Claude | `~/.claude/skills`, `.claude/skills` |
| Codex | `~/.codex/skills`, `.codex/skills` |
| Agents | `~/.agents/skills`, `.agents/skills`, `skills/` |
| Project | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md` |

Token counts are estimates (`characters / 4`), not a vendor tokenizer.

## Example

From a developer machine with a large local skill library:

```text
6 roots · 1,553 skills · 10 rules
metadata ~68,792 tokens
all bodies ~3,344,017 tokens
```

`doctor` on the same machine: **233 issues** (60 duplicate names, 152 oversized files, 20 missing descriptions).

## License

MIT
