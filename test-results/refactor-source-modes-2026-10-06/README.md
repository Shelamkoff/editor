# Доказательства прохода 06.10.2026

База: `75c909ac621c74610b083b55170155cc0c72f389`; ветка `refactor/rector-v2-architecture`. Финальный отчёт: [режимы исходников и CSS](../../RECTOR_V2_SOURCE_MODES_AND_STYLES_2026-10-06.md).

Логи Red сохранены до исправлений: `source-modes-red.log`, `style-ownership-red.log`, `readme-validation-red.log`. Green и окончательные gates сохранены отдельно. `node-initial.log` содержит обнаруженное проверкой непереведённое слово; окончательный `node.log` относится к исправленному RU тексту.

Для повторения нового native fixture в PowerShell:

```powershell
$env:EDITOR_NATIVE_PAGE='native-source-modes.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
```

Для CSS:

```powershell
node --test plugins/style-ownership.test.js
$env:EDITOR_BROWSER_PAGE='plugin-style-ownership.html'
node tests/browser/run.mjs
Remove-Item Env:EDITOR_BROWSER_PAGE
```

`readme-faults.mjs` временно нарушает `plugins/raw/README.md`, проверяет ненулевой exit code валидатора и всегда восстанавливает файл в `finally`. Запускайте отдельно от сборок или браузерных проверок, читающих эти файлы:

```powershell
node test-results/refactor-source-modes-2026-10-06/readme-faults.mjs
node scripts/validate-extension-readmes.mjs
```

Полный проход:

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
$env:RECTOR_QA_DIR='test-results/refactor-source-modes-2026-10-06/demo'
node scripts/vitepress-browser-smoke.mjs
Remove-Item Env:RECTOR_DOCS_URL
Remove-Item Env:RECTOR_QA_DIR
```

Результаты полного runner включают все предыдущие группы и новую `nativeSourceModes`. CSS ownership входит в штатную страницу `plugin-style-ownership.html`. Runner запускает только собственный headless Chrome; видимые окна Chrome не создаются.

Для исторической сверки используется внешний runtime из `test-results/refactor-equivalence-2026-10-05/v1-oracle`, проверенный по `v1-source-snapshot.json`. `oracle.html`/`style-oracle.html` копируются временно в `tests/browser/native-vone-*.html` и запускаются через `EDITOR_NATIVE_PAGE`; после проверки временные файлы удаляются. `oracle.js` проверяет режимы, `style-oracle.js` — настройки CSS. Код v1 не входит в production или штатную матрицу v2.

`source-snapshot.json` фиксирует байты 589 входных файлов до окончательных gates. `summarize.mjs` пересчитывает summary из raw logs и проверяет эти hashes. Не запускайте его повторно в опубликованной папке без пересчёта `source-manifest.json`: summary содержит время проверки.
