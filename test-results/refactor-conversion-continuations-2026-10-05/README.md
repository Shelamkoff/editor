# Proof — conversion continuations, 05.10.2026

База: 9df0db9f8177fb68a54de2a5079a3539ce547879, branch refactor/rector-v2-architecture.
Отчёт: ../../RECTOR_V2_CONVERSION_CONTINUATIONS_2026-10-05.md.

## Воспроизведение

Из корня репозитория:

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

Сборки запускаются последовательно. Адресный прогон:

```powershell
$env:EDITOR_NATIVE_PAGE='native-conversion-continuations.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
```

Полный native runner включает новую fixture. Все drag/click/key события в ней поступают от Chrome/CDP; public API используется для make/save/render/read-only/destroy/extension contract.
IME использует Input.imeSetComposition и движок Chrome: start/update trusted; completion engine-generated, но Chrome помечает его untrusted.
Реальный OS IME этим не утверждается. Никакие видимые/пустые окна Chrome не создаются.

Dev demo QA:

```powershell
$env:RECTOR_DOCS_URL='http://127.0.0.1:5173/ru/'
$env:RECTOR_QA_DIR='test-results/refactor-conversion-continuations-2026-10-05/demo'
node scripts/vitepress-browser-smoke.mjs
Remove-Item Env:RECTOR_DOCS_URL
Remove-Item Env:RECTOR_QA_DIR
```

## Red/Green и snapshots

background-focus-red.log и background-input-red.log — потеря фокуса/ввода после Escape до исправления.
caret-end-red.log — X заменяет прежний преобразованный диапазон после End.
background-cancel-green.log и caret-end-green.log — адресные проверки после исправлений.
continuations-green.log — ранний общий проход 65 случаев; native-all.log — окончательный проход с дополнительной same-ID assertion.
restoration-scope-initial.log подтверждает эту assertion; продуктовый код при её добавлении не менялся.

source-snapshot-before-scope-assertion.json снят до non-browser gates. source-snapshot.json снят перед final browser/native gates; отличается только дополнительной same-ID assertion в новой fixture.
Manifest относится к локальным байтам до Git LF/CRLF normalization. Raw logs не очищаются после hashing.

## Исторический oracle

Исходники v1 не поставляются в пакете и не входят в native-all. Извлекать только в исключённую папку доказательств:

```powershell
$v1Files = git ls-tree -r --name-only 5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340 -- index.js core plugins inline-plugins inline-tools locale shared | Where-Object { $_ -notlike '*.test.js' }
git archive 5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340 --output=test-results/refactor-equivalence-2026-10-05/v1-oracle.tar -- $v1Files
New-Item -ItemType Directory -Force test-results/refactor-equivalence-2026-10-05/v1-oracle
tar -xf test-results/refactor-equivalence-2026-10-05/v1-oracle.tar -C test-results/refactor-equivalence-2026-10-05/v1-oracle
Copy-Item -LiteralPath test-results/refactor-conversion-continuations-2026-10-05/oracle.html -Destination tests/browser/native-vone-continuations.html
$env:EDITOR_NATIVE_PAGE='native-vone-continuations.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
Remove-Item -LiteralPath tests/browser/native-vone-continuations.html
```

Приведённое извлечение исключает исторические *.test.js из временного checkout. Итоговые логи и хеши можно проверить командой node test-results/refactor-conversion-continuations-2026-10-05/summarize.mjs.
v1-source-snapshot.json фиксирует 240 JS/CSS sources; их содержимое совпало с Git после LF normalization. Local и Git byte hashes записаны отдельно.
oracle.js пишет фактические наблюдения после реальных действий; PASS у oracle подтверждает setup/conversion/gesture delivery, наблюдаемый дефект Background также записан явно.
