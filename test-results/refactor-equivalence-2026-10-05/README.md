# Повторная сверка Rector v2 — 2026-10-05

Итоговые результаты и SHA-256 находятся в verification-summary.json и source-manifest.json. Исторические red-логи демонстрируют дефект до исправления; итоговые gates проверяют окончательные исходники.

## Повторить текущие проверки

Из корня checkout, последовательно:

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:types
npm.cmd run test:package
npm.cmd run test:docs
npm.cmd run docs:check
node tests/browser/run.mjs
node tests/browser/physical-history.mjs
node tests/browser/heap-gate.mjs
node benchmarks/bundle-budget.mjs --enforce
~~~

Не запускать npm test и test:package параллельно: обе команды пересобирают dist.

Адресная матрица преобразования, выделения, каретки и истории:

~~~powershell
$env:EDITOR_NATIVE_PAGE='native-conversion-preservation.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
~~~

Для проверки действующего демо запустить npm.cmd run docs:dev -- --port 5173 --strictPort, затем:

~~~powershell
$env:RECTOR_DOCS_URL='http://127.0.0.1:5173/ru/'
$env:RECTOR_QA_DIR='test-results/refactor-equivalence-2026-10-05/demo'
node scripts/vitepress-browser-scenarios.mjs
Remove-Item Env:RECTOR_DOCS_URL
Remove-Item Env:RECTOR_QA_DIR
~~~

Браузерные runners используют собственный headless Chrome и доверенный CDP ввод. Видимые окна Chrome не требуются.

## Внешнее доказательство v1

v1-oracle.log содержит восемь сценариев на исходниках v1 из Git SHA 5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340: Heading/List/Code/Raw, forward/backward. Для v1 наблюдения проверяют содержимое, группировку, реальную подсветку, текстовый toolbar и конечную каретку. Класс oe-editor--cross-selecting у Code/Raw в v1 оставался после исчезновения подсветки; этот дефект не является ожидаемым поведением v2.

oracle.js и oracle.html — воспроизводимый исторический probe. Исходники v1 не входят в коммит, пакет или матрицу v2; их можно временно извлечь в исключённую папку доказательств:

~~~powershell
git archive 5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340 --output=test-results/refactor-equivalence-2026-10-05/v1-oracle.tar index.js core plugins inline-plugins inline-tools locale shared
New-Item -ItemType Directory -Force test-results/refactor-equivalence-2026-10-05/v1-oracle
tar -xf test-results/refactor-equivalence-2026-10-05/v1-oracle.tar -C test-results/refactor-equivalence-2026-10-05/v1-oracle
Copy-Item -LiteralPath test-results/refactor-equivalence-2026-10-05/oracle.html -Destination tests/browser/native-vone-oracle.html
$env:EDITOR_NATIVE_PAGE='native-vone-oracle.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
Remove-Item -LiteralPath tests/browser/native-vone-oracle.html
~~~

Пока временная копия v1 содержит её *.test.js, не запускать общий node --test: он обнаружит и исторические тесты.

## TDD

- registry-accessor-red/green: однократный snapshot свойства selectionMode.
- join-contract-red/green: optional joinSelection остаётся неизменяемым и связанным с исходным receiver.
- same-type-red: matching middle/endpoints теряли структуру и параметры.
- checklist-residual-red: выбранные пункты оставались пустыми в невыделенном остатке.
- converted-selection-red: после текстового преобразования исчезали range/конечная каретка.
- joined-code-red: несколько Code вместо одной цели с выбранным текстом.
- same-type-noop-red/green, local-noop-red/green: выбор текущего типа не должен делить блок или создавать историю.
- repeated-conversion-red/green: следующее преобразование должно использовать сохранённый интервал; Undo возвращает первую конечную каретку.
- plain-target-red/green: Undo → Code не должен сохранять старое логическое выделение и rich-text toolbar.

Окончательный общий native-all.log включает все новые случаи и прежние suites ядра и плагинов. node.log, browser.log, heap.log, build.log, consumer-types.log, package.log, docs.log, docs-check.log, bundle.log и demo.log — самостоятельные итоговые gates. PNG из demo/ показывают проверенное локальное демо RU/EN.
