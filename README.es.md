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

<p align="center"><b>Análisis estático para skills de agentes de IA.</b></p>

<p align="center">
  Audita <code>SKILL.md</code>, <code>AGENTS.md</code> y reglas de editor usadas por
  <b>Codex</b>, <b>Cursor</b> y <b>Claude Code</b>.
  Detecta duplicados, metadatos faltantes y saturación de contexto antes de que entren en el prompt.
</p>

---

## Por qué existe

Los agentes de código ya no leen un solo system prompt. Cargan un catálogo de skills bajo demanda.

Ese catálogo solo funciona cuando es **pequeño, tiene nombre y description**. Una máquina con cientos de skills copiados:

- gasta miles de tokens en metadatos antes de trabajar
- esconde el skill útil detrás de copias casi idénticas
- inyecta cuerpos de 10k tokens en un solo turno
- falla en silencio si falta `description`

`skillint` es el linter de esa carpeta. No ejecuta skills. No borra archivos. Solo informa el coste que el agente tendría que cargar.

## Instalación

Requiere Node.js 22.12 o superior.

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

`prune` y `report` son de solo lectura. skillint nunca elimina archivos de skills.

Los tokens son estimaciones (caracteres / 4), no el tokenizer oficial de cada proveedor.

## License

[MIT](./LICENSE) © 2026 [iosrxwy](https://github.com/iosrxwy)
