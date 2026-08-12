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

<p align="center"><b>Статический анализ skills для ИИ-агентов.</b></p>

<p align="center">
  Проверяет <code>SKILL.md</code>, <code>AGENTS.md</code> и правила редактора, которые используют
  <b>Codex</b>, <b>Cursor</b> и <b>Claude Code</b>.
  Находит дубликаты, пропущенные метаданные и раздувание контекста до того, как они попадут в промпт.
</p>

---

## Зачем это нужно

Агенты для кода больше не читают один system prompt. Они загружают каталог skills по требованию.

Каталог работает только когда он **короткий, именованный и с description**. Машина с сотнями скопированных skills:

- тратит тысячи токенов на метаданные до настоящей работы
- прячет полезный skill за почти одинаковыми копиями
- вставляет тела на 10k токенов за один ход
- молча не выбирает skill, если нет `description`

`skillint` — линтер этой папки. Он не запускает skills и не удаляет файлы. Он сообщает, какую нагрузку агенту пришлось бы нести.

## Установка

Нужен Node.js 18.18 или новее.

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint
npm install
npm run build
node dist/cli.js scan
```

## Команды

```bash
skillint scan
skillint doctor
skillint tokens
skillint prune --keep 12
skillint report --out out.md
```

`prune` и `report` только читают данные. skillint никогда не удаляет файлы skills.

Число токенов — оценка (символы / 4), а не официальный tokenizer провайдера.

## License

[MIT](./LICENSE) © 2026 [iosrxwy](https://github.com/iosrxwy)
