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
  <img src="docs/logo-light.svg" width="96" height="96" alt="skillint">
</p>

<h1 align="center">skillint</h1>

<p align="center"><b>AI Agent Skills 的靜態分析工具。</b></p>

<p align="center">
  檢查 Codex、Cursor、Claude Code 使用的 <code>SKILL.md</code>、<code>AGENTS.md</code> 與編輯器規則。
  在它們進入提示詞之前，找出重名、缺中繼資料、以及會撐爆上下文的檔案。
</p>

---

## 為什麼需要它

現在的程式設計 Agent 不再只讀一份系統提示，而是按需載入 skill 目錄。

這個目錄只有在<strong>短、有名稱、有 description</strong> 時才有效。本機若複製了數百上千個 skill，常見後果是：

- 正式工作之前，光中繼資料就要消耗成千上萬 token
- 有用的 skill 被近乎重複的副本擋住
- 單次對話被上萬 token 的正文打滿
- 缺少 `description` 時靜默失敗，skill 永遠不會被選中

`skillint` 為此目錄做靜態檢查。它不執行 skill，也不刪除檔案，只報告 Agent 將要負擔的成本。

## 安裝

需要 Node.js 22.12+。

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint
npm install
npm run build
node dist/cli.js scan
```

## 常用指令

```bash
skillint scan
skillint doctor
skillint audit
skillint tokens
skillint prune
skillint report --out out.md
```

`prune` 與 `report` 皆為唯讀。skillint 不會刪除任何 skill 檔案。

Token 為估算值（字元數 / 4），用於比較體積，不是各家官方 tokenizer。

## License

[MIT](./LICENSE) © 2026 [iosrxwy](https://github.com/iosrxwy)
