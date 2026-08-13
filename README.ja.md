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
  <img src="docs/logo.png" width="96" height="96" alt="skillint">
</p>

<h1 align="center">skillint</h1>

<p align="center"><b>AI エージェントスキルの静的解析ツール。</b></p>

<p align="center">
  Codex / Cursor / Claude Code が読む <code>SKILL.md</code>、<code>AGENTS.md</code>、エディタルールを監査します。
  重複、メタデータ欠落、コンテキスト肥大化を、プロンプトに入る前に見つけます。
</p>

---

## なぜ必要か

コーディングエージェントは、単一のシステムプロンプトではなく、オンデマンドで skill カタログを読み込みます。

カタログは **短く、名前があり、description がある** ときだけ機能します。数百〜数千の skill をコピーしたマシンでは：

- 本番作業の前に、メタデータだけで数千トークンを消費する
- 有用な skill がほぼ同一の複製に埋もれる
- 1 ターンで 1 万トークン級の本文が注入される
- `description` が無いと黙って選ばれない

`skillint` はそのフォルダのリンタです。skill は実行しません。ファイルは削除しません。エージェントが背負うコストだけを報告します。

## インストール

Node.js 18.18 以降が必要です。

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint
npm install
npm run build
node dist/cli.js scan
```

## コマンド

```bash
skillint scan
skillint doctor
skillint tokens
skillint prune --keep 12
skillint report --out out.md
```

`prune` と `report` は読み取り専用です。skillint は skill ファイルを削除しません。

トークン数は概算（文字数 / 4）であり、各社の公式 tokenizer ではありません。

## License

[MIT](./LICENSE) © 2026 [iosrxwy](https://github.com/iosrxwy)
