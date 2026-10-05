# Проверка последовательностей команд — 2026-10-05

Полный отчёт: ../../RECTOR_V2_INTERACTION_SEQUENCES_2026-10-05.md. Red-логи cancelled-menu-red и heading-control-red воспроизводят два дефекта до исправления. Итоговые результаты и SHA-256 — в verification-summary.json и source-manifest.json.

Из корня checkout, последовательно:

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:docs
npm.cmd run test:types
npm.cmd run test:package
npm.cmd run docs:check
node benchmarks/bundle-budget.mjs --enforce
node tests/browser/run.mjs
node tests/browser/physical-history.mjs
node tests/browser/heap-gate.mjs
~~~

Адресно повторить 24 новых случая:

~~~powershell
$env:EDITOR_NATIVE_PAGE='native-interaction-sequences.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
~~~

Проверить действующее RU/EN демо:

~~~powershell
$env:RECTOR_DOCS_URL='http://127.0.0.1:5173/ru/'
$env:RECTOR_QA_DIR='test-results/refactor-interaction-sequences-2026-10-05/demo'
node scripts/vitepress-browser-smoke.mjs
Remove-Item Env:RECTOR_DOCS_URL
Remove-Item Env:RECTOR_QA_DIR
~~~

Запуск демо: npm.cmd run docs:dev -- --port 5173 --strictPort. Runners используют собственный headless Chrome. Не запускать npm test и test:package параллельно: обе команды пересобирают dist.

Предыдущие доказательства исторического v1 oracle сохранены отдельно в ../refactor-equivalence-2026-10-05/; исходники v1 не добавлены в текущую матрицу или production imports.
