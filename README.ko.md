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

<p align="center"><b>AI 에이전트 스킬을 위한 정적 분석 도구.</b></p>

<p align="center">
  Codex, Cursor, Claude Code가 사용하는 <code>SKILL.md</code>, <code>AGENTS.md</code>, 에디터 규칙을 검사합니다.
  중복, 메타데이터 누락, 컨텍스트 폭주를 프롬프트에 들어가기 전에 찾습니다.
</p>

---

## 왜 필요한가

코딩 에이전트는 더 이상 시스템 프롬프트 하나만 읽지 않습니다. 필요할 때 skill 목록을 로드합니다.

이 목록은 **짧고, 이름이 있고, description이 있을 때**만 동작합니다. 수백~수천 개의 skill을 복사한 환경에서는:

- 실제 작업 전에 메타데이터만으로 수천 토큰을 소비합니다
- 유용한 skill이 거의 같은 복사본에 가려집니다
- 한 턴에 1만 토큰 분량의 본문이 주입됩니다
- `description`이 없으면 조용히 선택되지 않습니다

`skillint`는 그 폴더의 린터입니다. skill을 실행하지 않고, 파일을 삭제하지 않으며, 에이전트가 감당해야 할 비용만 보고합니다.

## 설치

Node.js 22.12 이상이 필요합니다.

```bash
git clone https://github.com/iosrxwy/skillint.git
cd skillint
npm install
npm run build
node dist/cli.js scan
```

## 명령

```bash
skillint scan
skillint doctor
skillint audit
skillint tokens
skillint prune
skillint report --out out.md
```

`prune`과 `report`는 읽기 전용입니다. skillint는 skill 파일을 삭제하지 않습니다.

토큰 수는 추정값(문자 수 / 4)이며 각 업체의 공식 tokenizer가 아닙니다.

## License

[MIT](./LICENSE) © 2026 [iosrxwy](https://github.com/iosrxwy)
