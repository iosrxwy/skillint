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

<h1 align="center">skillint</h1>

<p align="center"><b>Analyse statique pour les skills d’agents IA.</b></p>

<p align="center">
  Audite les fichiers <code>SKILL.md</code>, <code>AGENTS.md</code> et les règles d’éditeur utilisés par
  <b>Codex</b>, <b>Cursor</b> et <b>Claude Code</b>.
  Détecte les doublons, les métadonnées manquantes et le gonflement du contexte avant qu’ils n’entrent dans le prompt.
</p>

---

## Pourquoi cet outil

Les agents de code ne lisent plus un seul system prompt. Ils chargent un catalogue de skills à la demande.

Ce catalogue ne fonctionne que s’il est **court, nommé et décrit**. Une machine qui a copié des centaines de skills :

- consomme des milliers de tokens de métadonnées avant le vrai travail
- masque le skill utile derrière des copies quasi identiques
- injecte des corps de 10k tokens en un seul tour
- échoue silencieusement si `description` est absent

`skillint` est le linter de ce dossier. Il n’exécute pas les skills. Il ne supprime aucun fichier. Il rapporte le coût que l’agent devrait porter.

## Installation

Node.js 18.18 ou plus récent.

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint
npm install
npm run build
node dist/cli.js scan
```

## Commandes

```bash
skillint scan
skillint doctor
skillint tokens
skillint prune --keep 12
skillint report --out out.md
```

`prune` et `report` sont en lecture seule. skillint ne supprime jamais de fichiers de skills.

Les tokens sont des estimations (caractères / 4), pas le tokenizer officiel d’un fournisseur.

## License

[MIT](./LICENSE) © 2026 [iosrxwy](https://github.com/iosrxwy)
