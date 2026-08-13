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

<p align="center"><b>Análise estática para skills de agentes de IA.</b></p>

<p align="center">
  Audita <code>SKILL.md</code>, <code>AGENTS.md</code> e regras de editor usadas por
  <b>Codex</b>, <b>Cursor</b> e <b>Claude Code</b>.
  Encontra duplicatas, metadados ausentes e inchaço de contexto antes de entrarem no prompt.
</p>

---

## Por que existe

Agentes de código não leem mais um único system prompt. Eles carregam um catálogo de skills sob demanda.

Esse catálogo só funciona quando é **pequeno, nomeado e descrito**. Uma máquina com centenas de skills copiados:

- gasta milhares de tokens em metadados antes do trabalho real
- esconde o skill útil atrás de cópias quase idênticas
- injeta corpos de 10k tokens em um único turno
- falha em silêncio quando falta `description`

`skillint` é o linter dessa pasta. Não executa skills. Não apaga arquivos. Apenas relata o custo que o agente teria de carregar.

## Instalação

Requer Node.js 22.12 ou superior.

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint
npm install
npm run build
node dist/cli.js scan
```

## Comandos

```bash
skillint scan
skillint doctor
skillint tokens
skillint prune --keep 12
skillint report --out out.md
```

`prune` e `report` são somente leitura. skillint nunca apaga arquivos de skill.

Os tokens são estimativas (caracteres / 4), não o tokenizer oficial de cada provedor.

## License

[MIT](./LICENSE) © 2026 [iosrxwy](https://github.com/iosrxwy)
