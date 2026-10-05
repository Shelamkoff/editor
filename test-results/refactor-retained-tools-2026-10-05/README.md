# Native tools after conversion — 2026-10-05

База: bb8f2c77493d79b94bc9ab2b84d6d5d544a10246, ветка refactor/rector-v2-architecture.
Доказательства относятся к локальным байтам до Git LF/CRLF normalization. Исходники зафиксированы в source-snapshot.json перед общими gates.

## Адресная проверка

Новые случаи находятся в tests/browser/native-retained-tools.html и native-retained-tools.js.
Физический ввод: собственный headless Chrome/CDP, доверенные mousedown/keyboard/clipboard события, без новых видимых окон Chrome.

```powershell
$env:EDITOR_NATIVE_PAGE='native-retained-tools.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
```

Для одного сценария перед запуском дополнительно задаётся EDITOR_NATIVE_FILTER с буквальной подстрокой имени теста.
Исторические red/первые green запускались до выделения сценариев из native-interaction-sequences.html в новую fixture; это тот же публичный сценарий.

- selection-text-red.log / selection-text-green.log: публичный inline context имел range "phaBra", но пустой text.
- font-size-history-red.log / font-size-history-green.log: Undo размера шрифта терял исходную conversion end caret.
- background-history-red.log: аналогичный исходный дефект Undo цвета.
- background-input-red.log: физический фокус ColorPicker очищал selectedIds.
- background-history-green.log: оба исправления ColorPicker, история и диапазон проходят.
- local-backward-red.log / local-backward-green.log: общий прогон выявил регрессию направления local Font size; сохранённый toolbar bookmark и selectionBefore её исправляют.
- source-snapshot-before-local-fix.json: историческая версия перед этой коррекцией; окончательные gates относятся только к source-snapshot.json.
- retained-tools-green.log: 64 случая на окончательном коде: контекст, все 12 tools, reset и local partial Undo/Redo.
- reset-after-conversion.log: сброс размера/цвета сохраняет курсив, края, каретку Undo и результат Redo.
- v1-contracts.json: внешние исходные контракты исторической версии; runtime v2 их не импортирует.

## Полные команды

Каждый процесс записывает stdout/stderr в отдельный одноимённый log. Сборки выполняются последовательно.

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
$env:RECTOR_DOCS_URL='http://127.0.0.1:5173/ru/'
$env:RECTOR_QA_DIR='test-results/refactor-retained-tools-2026-10-05/demo'
node scripts/vitepress-browser-smoke.mjs
Remove-Item Env:RECTOR_DOCS_URL
Remove-Item Env:RECTOR_QA_DIR
```

verification-summary.json содержит подсчитанные результаты финального полного native-all.log.
source-manifest.json фиксирует итоговые доказательства, отчёт и исходники.
