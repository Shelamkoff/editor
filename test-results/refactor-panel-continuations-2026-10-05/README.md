# Proof — panel continuations, 05.10.2026

База: 93e6d3bee9cc6f658c235cb5d76aa394529bd09a, branch refactor/rector-v2-architecture.
Отчёт: ../../RECTOR_V2_PANEL_CONTINUATIONS_2026-10-05.md.

## Воспроизведение

Из корня репозитория, последовательно:

```powershell
npm run typecheck
npm test
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
node benchmarks/bundle-budget.mjs --enforce
node tests/browser/run.mjs
node tests/browser/physical-history.mjs
node tests/browser/heap-gate.mjs
```

Адресные страницы: native-font-cancel.html, native-background-cancel.html, native-link-cancel.html, native-panel-keyboard.html. В полном runner зарегистрированы все четыре.

```powershell
$env:EDITOR_NATIVE_PAGE='native-panel-keyboard.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
```

Все drag/click/key/Tab/Escape поступают от собственного headless Chrome/CDP. В setup используется public blocks.focus, чтобы открыть rich author field плагина. Синтетические DOM mouse/key события не используются. Видимые/пустые окна Chrome не создаются.

Dev demo QA:

```powershell
$env:RECTOR_DOCS_URL='http://127.0.0.1:5173/ru/'
$env:RECTOR_QA_DIR='test-results/refactor-panel-continuations-2026-10-05/demo-final'
node scripts/vitepress-browser-smoke.mjs
Remove-Item Env:RECTOR_DOCS_URL
Remove-Item Env:RECTOR_QA_DIR
```

## TDD и свидетельства

font-button-red.log и link-button-red.log — подтверждённые продуктовые Red: Escape на кнопке Apply не закрывает панель.
action-focus-confirmed-red.log — после уточнения селектора действующей панели: Tab не достигает Align.
font-button-green.log, button-green.log — отдельные Green; keyboard-final-green.log — 32 сценария; panel-ownership-green.log — два дополнительных случая отзыва/владения Escape.
swatch-red.log показывает невидимый индикатор в light theme; swatch-green-final.log — обе темы после исправления. Окончательное доказательство всех 36 случаев и всех остальных групп — native-all.log на зафиксированных источниках.

Ранние диагностические логи остаются локально исключёнными. Ошибки setup/селекторов и assertion истории после render не выдаются за продуктовые Red. Сбой bridge __resolveTestInput при одном промежуточном прогоне не считается продуктовой ошибкой; отдельный повтор Background прошёл, а окончательный full native gate прошёл полностью: 1522 PASS, 0 FAIL.

source-snapshot.json содержит SHA-256 локальных байтов исходников до всех окончательных gates после исправления индикатора. source-snapshot-before-doc-format.json сохраняет первый срез (несмотря на имя, markup RU/EN к этому моменту уже исправлен), source-snapshot-before-swatch.json — второй идентичный срез перед исправлением цвета; первый общий native проход сохранён в native-all-before-swatch.log. После них проверяются те же хеши. Manifest также относится к локальным байтам до Git LF/CRLF normalization. Raw logs не очищаются после hashing.
summarize.mjs читает логи, проверяет counts и snapshots и переписывает verification-summary.json. После его запуска нужно обновить hash summary в manifest.

## Исторический oracle

v1 5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340 остаётся внешним доказательством: runtime не включён в product imports или native-all. Используется только исключённый test-results/refactor-equivalence-2026-10-05/v1-oracle.

Если этой папки нет, извлеките v1 по командам предыдущего proof README (../refactor-conversion-continuations-2026-10-05/README.md), без исторических *.test.js.

```powershell
Copy-Item -LiteralPath test-results/refactor-panel-continuations-2026-10-05/oracle.html -Destination tests/browser/native-vone-panels.html
$env:EDITOR_NATIVE_PAGE='native-vone-panels.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
Remove-Item -LiteralPath tests/browser/native-vone-panels.html
```

Oracle проверяет 10 реальных сценариев и фиксирует public inlineTools policy всех 21 плагина. v1-source-snapshot.json содержит 240 JS/CSS sources, сверенных с Git после LF normalization; local/Git byte hashes записаны отдельно.
