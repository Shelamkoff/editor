# Проверка всей библиотеки — 06.10.2026

База: `41c205ea663f896f052d3bd84aea2752892c8c82`, ветка `refactor/rector-v2-architecture`. Итоговые результаты вычисляет `summarize.mjs`; главный отчёт — [RECTOR_V2_LIBRARY_AUDIT_2026-10-06.md](../../RECTOR_V2_LIBRARY_AUDIT_2026-10-06.md).

## Red → Green через публичные API

| Контракт | Первоначальный Red | Green |
| --- | --- | --- |
| Mention читает собственный trigger один раз и игнорирует наследуемый | [mention-trigger-red.log](mention-trigger-red.log) | [27 Node cases](ownership-matrix-complete.log), [21 native cases](library-native-complete.log) |
| Пользовательская схема renderer фиксирует версию, методы и исходный receiver | [renderer-schema-red.log](renderer-schema-red.log) | та же матрица |
| Схема и список стилей inline renderer захватываются однократно | [inline-renderer-styles-red.log](inline-renderer-styles-red.log) | та же матрица |
| Свойство bind callback не должно подменять захват функции | [callable-methods-red.log](callable-methods-red.log) | та же матрица |

После адресных циклов расширенная матрица повторена на закреплённом исходном коммите: [baseline.mjs](baseline.mjs), [27 cases: 26 FAIL / 1 PASS](baseline-ownership-red.log), [хеши оригинальных модулей](baseline-sources.json). Только импорт Poll helper направлен на его исходную закреплённую копию. Эта дополнительная ретроспективная проверка не представляется как первоначальный test-first Red всех 27 случаев.

[shared-schema-equivalence.json](shared-schema-equivalence.json) подтверждает равенство функции core до/после извлечения при удалении нового параметра renderer-only default probe. Ядро продолжает проверять default roundtrip. Для пользовательского block renderer сохранена прежняя политика без вызова default при регистрации; все decode/encode результаты защищены общим контрактом.

Промежуточные `schema-capture-not-applied.log`, `schema-styles-partial-patch.log` и `typecheck-initial.log` сохраняют ошибки применения multiline patch из-за CRLF. Исправлены сами patches; утверждения тестов не ослаблены. Исходный `docs-check-brand-prose-red.log` сохраняет требование русской документации: названия пакетов в prose оформлены как code, аудит не изменён. Следующий `docs-check-relative-link-red.log` записывает отказ Windows link-checker при relative route; ссылки приведены к существующей в guide абсолютной схеме путей с учётом языка.

## Настоящий ввод и историческая версия

Новая [native fixture](../../tests/browser/native-library-boundaries.js) проверяет trusted CDP clicks/keyboard, выбор Mention, Undo/Redo, работающий результат renderer после отказа, прямое и обратное выделение input и следующий ввод, однократное освобождение staged/prior результатов.

[Три случая настоящей v1](v1-mention.log) запускают прежний код, а не реконструкцию v1 API. Все 240 JS/CSS проверяются через [prepare-v1.mjs](prepare-v1.mjs) и [v1-source-snapshot.json](v1-source-snapshot.json). Исторический код никогда не входит в продукт.

## Воспроизведение

Запускать из корня репозитория после `npm ci`:

```powershell
node test-results/refactor-library-2026-10-06/baseline.mjs
node test-results/refactor-library-2026-10-06/prepare-v1.mjs
node test-results/refactor-library-2026-10-06/run-v1.mjs
node --test inline-plugins/mention.config.test.js renderer/schema-ownership.test.js
node test-results/refactor-library-2026-10-06/run-gate.mjs native-all
node test-results/refactor-library-2026-10-06/run-gate.mjs typecheck
node test-results/refactor-library-2026-10-06/run-gate.mjs node
node test-results/refactor-library-2026-10-06/run-gate.mjs consumer-types
node test-results/refactor-library-2026-10-06/run-gate.mjs bundle
node test-results/refactor-library-2026-10-06/run-gate.mjs package
npm run build
node test-results/refactor-library-2026-10-06/run-gate.mjs docs
node test-results/refactor-library-2026-10-06/run-gate.mjs docs-check
node test-results/refactor-library-2026-10-06/run-gate.mjs browser
node test-results/refactor-library-2026-10-06/run-gate.mjs heap
# Демо-сервер запускается отдельно: npm run docs:dev -- --host 127.0.0.1 --port 5173
node test-results/refactor-library-2026-10-06/run-gate.mjs demo
node test-results/refactor-library-2026-10-06/summarize.mjs
```

Bundle/package изменяют `dist`, поэтому выполнять их последовательно; `npm run build` восстанавливает dist перед проверкой 92 упакованных README. Остальные независимые gates допускают параллельное выполнение. Native runner использует скрытый headless Chrome прямо с URL стенда; видимые пустые окна не создаются.

## Целостность и границы

[604 проверяемых файлов](source-snapshot.json) проверяются после всех gates. Первоначальная [фиксация](source-snapshot-before-docs-brand-format.json) содержала 600 файлов. В унаследованный набор не входили четыре изменённых guide-файла; итоговый snapshot добавляет их хеши после проверок документации. В исходных 600 файлах единственное побайтовое изменение — удаление одной лишней пустой строки в конце shared-schema модуля по staged whitespace check. До/после сохранены и сравниваются точно; код runtime и native fixtures не менялся. После этого повторены адресная native матрица, Node и TS. [Уточнение счётчика и области](summary-scope-correction.json). `source-manifest.json` связывает изменения и доказательства по локальным байтам до нормализации Git.

Общий native gate содержит все 30 прежних групп и новую группу из 21 случая. Он проверяет ядро, 21 block plugin, 12 inline tools и widgets, но не доказывает все возможные последовательности и внешние сервисы. Системный IME и Firefox/WebKit не проверены этим Chrome-прогоном.
