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

<p align="center"><b>Statische Analyse für AI-Agent-Skills.</b></p>

<p align="center">
  Prüft <code>SKILL.md</code>, <code>AGENTS.md</code> und Editor-Regeln von
  <b>Codex</b>, <b>Cursor</b> und <b>Claude Code</b>.
  Findet Duplikate, fehlende Metadaten und Context-Bloat, bevor sie im Prompt landen.
</p>

---

## Warum es das gibt

Coding-Agenten lesen nicht mehr nur ein System-Prompt. Sie laden einen Skill-Katalog on demand.

Dieser Katalog funktioniert nur, wenn er **klein, benannt und beschrieben** ist. Eine Maschine mit Hunderten kopierter Skills:

- verbraucht Tausende Tokens allein für Metadaten
- versteckt den nützlichen Skill hinter nahezu identischen Kopien
- injiziert 10k-Token-Bodies in einem Turn
- scheitert still, wenn `description` fehlt

`skillint` ist der Linter für diesen Ordner. Es führt keine Skills aus. Es löscht keine Dateien. Es berichtet nur, was der Agent tragen müsste.

## Installation

Node.js 18.18 oder neuer.

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint
npm install
npm run build
node dist/cli.js scan
```

## Befehle

```bash
skillint scan
skillint doctor
skillint tokens
skillint prune --keep 12
skillint report --out out.md
```

`prune` und `report` sind schreibgeschützt. skillint löscht niemals Skill-Dateien.

Token-Zahlen sind Schätzungen (Zeichen / 4), kein offizieller Tokenizer.

## License

[MIT](./LICENSE) © 2026 [iosrxwy](https://github.com/iosrxwy)
