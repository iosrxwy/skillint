<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.ko.md">한국어</a> ·
  <a href="./README.es.md">Español</a> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.de.md">Deutsch</a> ·
  <a href="./README.pt-BR.md">Português</a> ·
  <a href="./README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="docs/logo-light.svg" width="120" height="120" alt="skillint">
</p>

<h1 align="center">skillint</h1>

<p align="center"><b>给 <code>SKILL.md</code> 用的 eslint</b></p>

<p align="center">
  检查 Codex、Cursor、Claude Code、Grok、Gemini、Copilot 等工具使用的 <code>SKILL.md</code>、<code>AGENTS.md</code> 和编辑器规则。
  区分跨 Agent 同步副本与真实冲突，诊断损坏的元数据，并在它们成为 Agent 上下文前估算目录体量。
</p>

<p align="center">
  <a href="https://github.com/iosrxwy/skillint/actions/workflows/ci.yml"><img src="https://github.com/iosrxwy/skillint/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/skillint"><img src="https://img.shields.io/npm/v/skillint" alt="npm 版本"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <a href="https://github.com/iosrxwy/skillint/stargazers"><img src="https://img.shields.io/github/stars/iosrxwy/skillint?style=social" alt="stars"></a>
</p>

<p align="center">
  <img src="docs/social-light.svg" alt="skillint — 看清每个 Agent 实际能发现什么" width="720">
</p>

```bash
npx skillint
```

这会运行默认的跨 Agent 物理清单扫描。审计链路是静态、只读的：skill 只会被当作文本解析，绝不会被执行。`scan`、`map`、`doctor`、`tokens`、`prune` 不修改目录；`report` 只写入你指定的报告文件。

## 它解决什么

- **目录失控**：统一盘点 Codex、Cursor、Claude Code、Grok、Gemini、Copilot、OpenCode、Windsurf、Kiro、Cline 等工具的全局与项目级 skills / rules
- **按 Agent 解析**：按照 Cursor、Claude Code、Codex 各自的官方发现语义，把资源标为 effective、coexisting、shadowed、conditional 或 unknown
- **重复项噪声**：跨 Agent 安装记为 `synced-copy`（info），同一 Agent 系列内的重名才记为错误
- **Skill 规范损坏**：诊断缺失、未闭合或无效的 YAML frontmatter，以及必填字段、命名、正文过大、说明文件过长等问题
- **上下文体量不明**：用明确标注的估算值（`字符数 / 4`）比较元数据与正文；不冒充精确 tokenizer 成本，也不声称模型实际加载了哪些文件
- **CI 漂移**：输出 GitHub Action annotation 与 summary、Markdown/JSON 报告，并用 `--fail-on`、`--fail-under` 或共享配置阈值卡住回退
- **快速本地扫描**：并发、限量读取；识别符号链接并避免循环遍历；用 `skillint init` 生成合规起点

---

## 为什么需要它

编程 Agent 会从多个全局目录和项目目录发现说明文件。副本积累后，这个目录很快就难以判断：

- 同一 skill 装进多个 Agent 后，普通同步副本淹没真正的冲突
- 同一 Agent 系列内出现重名，选择会产生真实歧义
- frontmatter 损坏或字段缺失，skill 发现会变得不可靠
- 超大正文和 always-on rules 把潜在上下文成本藏了起来

<p align="center">
  <img src="docs/hero-light.svg" alt="把 Cursor、Claude Code 和 Codex 目录解析成可解释状态" width="720">
</p>

`skillint` 把这些目录整理成可执行的审计结果：清单、诊断、0–100 健康分、体量估算和精简建议，全程不删除文件。

## 安装

需要 Node.js 22.12+。

```bash
npx skillint scan
```

不用全局安装。希望一直使用 `skillint` 命令时：

```bash
npm install --global skillint
skillint scan
```

## 快速开始

```bash
npx skillint scan                 # 数量 + 体量估算 + 健康条
npx skillint map --agent cursor   # 当前目录对应的 Cursor 目录
npx skillint doctor               # 诊断
npx skillint init code-review     # 生成一份能直接通过 doctor 的 SKILL.md
npx skillint tokens               # 精简估算
npx skillint prune --keep 12      # 只给建议
npx skillint report --out out.md  # Markdown 报告
```

```bash
npx skillint scan -g              # 只扫用户级目录
npx skillint scan -p              # 只扫当前项目
npx skillint doctor ./skills
npx skillint doctor --json --fail-on error
npx skillint doctor --fail-under 80   # 健康分低于 80 时让 CI 失败
```

审计命令不会修改或删除被扫描的 skill。`report` 只创建指定的报告，`init` 也绝不会覆盖已有的 `SKILL.md`。

## Agent 感知的目录映射

`scan` 是覆盖多种工具的物理文件清单。它的 token 总量只描述磁盘上发现的文件，不代表某个 Agent 的有效目录，也不声称模型加载了全部文件。

`map` 会针对一个工作目录应用指定 Agent 的适配器：

```bash
npx skillint map [cwd] --agent cursor
npx skillint map [cwd] --agent claude
npx skillint map [cwd] --agent codex
npx skillint map . --agent codex --json
```

<p align="center">
  <img src="docs/map-light.svg" alt="Codex Agent 感知目录映射的浅色示例" width="720">
</p>

JSON 输出包含 `schemaVersion: 1`，并提供逻辑路径、真实路径、作用域、资源角色、来源类型、官方文档 URL、可见性和解析方式。

- `effective`：静态上属于当前说明链，或无条件加载
- `coexisting`：官方语义明确让同名资源作为独立条目共存
- `shadowed`：官方优先级规则明确选择了另一个已观察到的资源
- `conditional`：是否可用取决于目录/文件上下文、glob、手动调用或 Agent 的相关性判断
- `unknown`：行为未被官方说明、来源由外部托管，或依赖 `skillint` 未解析的信任/配置状态

`map` 不预测模型是否会触发某个 skill。Cursor 的同名 skill 优先级会标为 unknown，而不是猜测；Claude 的个人/项目优先级和目录限定 skill 会按官方语义处理；Codex 的同名 skills 共存，`AGENTS.override.md` 只会在同一目录层级盖过 `AGENTS.md`。托管与内置来源只作为限制说明，不会伪造成本地文件。

适配器语义来自当前官方文档：[Cursor skills](https://cursor.com/docs/skills) 与 [rules](https://cursor.com/docs/rules)、[Claude Code skills](https://code.claude.com/docs/en/skills) 与 [memory](https://code.claude.com/docs/en/memory)，以及 [Codex skills](https://developers.openai.com/codex/skills) 与 [`AGENTS.md`](https://developers.openai.com/codex/guides/agents-md)。

## 真实扫描结果

在一台装了大量 skills 的开发机上：

<p align="center">
  <img src="docs/scan-light.svg" alt="skillint 浅色扫描示例：1,658 个 skills，正文估算约 343 万 token" width="720">
</p>

同一台机器跑 `doctor`：**271 个结果**，其中包括 157 个正文过大、13 个同系列重名，以及 54 个仅作为提示而非错误的跨 Agent 同步副本。

约 343 万 token 是对已发现文件的体量估算，不代表任何 Agent 会把整个目录全部加载。

## `scan` 的物理清单范围

这些目录用于跨 Agent 的磁盘清单审计，其中包含兼容与旧版位置。需要查看某个 Agent 当前的有效目录语义时，请使用 `map`。

| 工具 | 全局 | 项目 |
| --- | --- | --- |
| Cursor | `~/.cursor/skills`、`~/.cursor/rules` | `.cursor/skills`、`.cursor/rules` |
| Claude Code | `~/.claude/skills`、`~/.claude/rules` | `.claude/skills`、`.claude/rules` |
| Codex | `~/.codex/skills`、`~/.codex/rules`、`~/.codex/prompts` | `.codex/skills`、`.codex/rules`、`.codex/prompts` |
| Grok | `~/.grok/skills`、`~/.grok/plugins` | `.grok/skills`、`.grok/plugins` |
| Gemini / Antigravity | `~/.gemini/skills`、`~/.antigravity/skills` | `.gemini/skills`、`.antigravity/skills` |
| GitHub Copilot | `~/.copilot/skills` | `.github/skills`、`.github/agents`、`.github/instructions` |
| OpenCode | `~/.config/opencode/skills` | `.opencode/skills` |
| Windsurf | `~/.codeium/windsurf/skills`、`~/.windsurf/skills` | `.windsurf/skills` |
| Kiro | `~/.kiro/skills`、`~/.kiro/steering` | `.kiro/skills`、`.kiro/steering` |
| Cline / Continue | `~/.cline/skills`、`~/.continue/skills` | `.cline/skills`、`.continue/skills` |
| 通用 agents | `~/.agents/skills` | `.agents/skills`、`skills/` |
| 其他 | Factory、OpenClaw、Hermes、Qoder、CodeBuddy、Goose、Amp、Roo、Trae、Crush、Pi、cc-switch | 对应的 `.tool/skills` |

也会读取项目说明文件：`AGENTS.md`、`AGENT.md`、`CLAUDE.md`、`GEMINI.md`、`GROK.md`、`CODEX.md`、`COPILOT.md`、`WINDSURF.md`、`OPENCODE.md`、`.cursorrules`、`.windsurfrules`、`.clinerules`、`.github/copilot-instructions.md`。

Token 是**物理清单估算值**，用来比较体积；它既不是各家官方 tokenizer，也不代表模型上下文，不能用来对账。

## GitHub Action

```yaml
- uses: iosrxwy/skillint@main
  with:
    fail-on: error
```

问题会以 PR annotation 标出来。同一个 skill 装在 Cursor / Claude / Grok 里会记成 `synced-copy`（info），不会把 CI 打红。

忽略规则可写在 `.skillintignore`，或使用 `--ignore`。

## 配置文件

在运行目录放一份 `skillint.config.json`，团队可以共享忽略规则并调整 doctor 阈值：

```json
{
  "$schema": "https://unpkg.com/skillint@latest/skillint.schema.json",
  "ignore": ["vendor", "*.bak"],
  "limits": {
    "skillBodyTokens": 3000,
    "descriptionMin": 60
  }
}
```

Schema 会提供编辑器自动补全，并抓出拼错的设置。可调阈值：`skillBodyTokens`（4000）、`ruleAlwaysOnTokens`（800）、`descriptionMax`（1024）、`descriptionMin`（40）、`agentsDocLines`（100）、`nameMax`（64）。

## License

[MIT](./LICENSE) © 2026 [iosrxwy](https://github.com/iosrxwy)
