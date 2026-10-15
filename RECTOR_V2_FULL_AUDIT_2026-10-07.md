# Rector v2 — аудит ядра, плагинов и архитектуры, 07.10.2026

Проверяемая ветка: `refactor/rector-v2-architecture`, исходный HEAD `98d5233` с локальными исправлениями этого аудита. База v1: `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`. Окружение: Windows, Node.js 24.9.0, npm 11.2.0, Chrome 154.0.8037.98.

**Результат:** подтверждённые ошибки ядра, Mention и Poll исправлены. Все окончательные gates прошли: 563 Node-теста, 1844 cases в 38 native-группах и 25 браузерных контрактных страниц. Проверенная матрица пользовательских возможностей всех 21 плагина и 12 inline tools сохранена. Неисправленных подтверждённых функциональных ошибок в этой матрице не осталось. Архитектурный долг и границы доказательства приведены ниже.

## Исправленные ошибки

1. **Mention: удаление слова.** Ctrl+Backspace/Delete изменяли подпись в DOM, но оставляли прежнее имя в JSON. Обработчик теперь использует целевой диапазон браузера для удаления слова и строки. Проверки сравнивают результат с независимым native текстом для латиницы, кириллицы и составного emoji, включая границы inline-элемента.
2. **Mention: локальный clipboard.** Вырезание и вставка внутри подписи обходили обновление данных; удаление trigger могло оставить прежнюю идентичность. Локальные Copy/Cut/Paste теперь обрабатываются владельцем подписи, сохраняют выбранный текст и выполняют одну каноническую операцию. Отказ записи clipboard запрещает Cut; событие постороннего input не захватывается. Удаление trigger превращает остаток в обычный текст. Структурное копирование виджета со стороны окружающего поля остаётся на общей границе clipboard ядра.
3. **Poll: уход фокуса.** Обработчик `focusout` копировал `innerHTML` поверх модели: Mention в вопросе и вариантах превращались в подписи, inline-карта терялась, Undo получал лишний шаг. Теперь Poll синхронизируется через существующий `commitDomMutation()` и канонический сериализатор ядра. Сам уход фокуса не создаёт авторскую историю.
4. **Ядро: скрытые авторские поля.** Сериализация учитывала inline-ссылки только смонтированных полей. Ввод в текущем слайде Carousel удалял данные других слайдов. Person дополнительно возвращал в `read()` старые DOM-подписи скрытой вкладки. Теперь скрытый rich text берётся из committed record, а ссылки считаются по всему результирующему блоку. Сохраняются известные и незагруженные inline payloads. Исправление общее, без ветвления ядра по именам плагинов.

Новые fixtures входят в штатный `npm run test:browser`: [Mention](tests/browser/native-audit-edges.js), [Poll](tests/browser/native-audit-poll.js), [скрытые поля](tests/browser/native-audit-hidden-fields.js). Всего добавлено 29 cases: 25 с настоящими клавиатурными/мышиными/clipboard жестами Chrome и четыре синтетические проверки контрактов clipboard/text replacement. Последние не выдаются за системные события.

Воспроизведения до исправлений сохранены: [удаление слова](test-results/audit-2026-10-07/edges-red.log), [clipboard](test-results/audit-2026-10-07/clipboard-red.log), [Poll](test-results/audit-2026-10-07/poll-red.log), [скрытые поля](test-results/audit-2026-10-07/hidden-fields-red.log).

## Паритет с v1

Сопоставлены закреплённые исходники v1, [матрица ядра](RECTOR_V2_CORE_PARITY_2026-10-04.md), [матрица плагинов](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md) и требования P1–P5/C0–C7 [действующей спецификации](RECTOR_V2_REMEDIATION_SPEC.md). Свежий прогон исполняет текущую v2; повторный запуск всего старого runtime в этом аудите не выполнялся.

[Инвентаризация](test-results/audit-2026-10-07/parity-inventory.json): все 21 каталога блочных плагинов v1 представлены фабриками v2; пропущенных типов нет. Сохраняются 12 default inline tools и два inline-плагина. Наличие фабрики — только инвентаризация; функциональные проверки выполняются через UI и проверяют модель, фокус, каретку и историю.

| Плагин | Проверяемые возможности |
| --- | --- |
| Paragraph | Ввод, Enter/Shift+Enter, merge, marks/widgets, выделение, clipboard, преобразование, alignment. |
| Heading | Уровни, drill-down, placeholder, rich text, выбор уровня, преобразование и история. |
| List | Ordered/unordered, split/merge/exit, IDs пунктов, частичные диапазоны, clipboard. |
| Quote | Основной текст и подпись, переходы между полями, форматирование, частичные/целые преобразования. |
| Code | Редактирование/просмотр, язык, подсветка, Copy, отступы, literal conversion. |
| Image | Upload/URL/custom sources, Replace/Delete, caption, размеры и настройки, async ownership. |
| Delimiter | Вставка, выбор целого блока, Move/Duplicate/Delete, история без editing host, renderer. |
| Table | Ячейки, Tab/Enter, header, строки/столбцы, stable IDs, многополевые диапазоны. |
| Checklist | Checkbox, split/exit/merge, IDs и checked state, clipboard, преобразования. |
| Warning | Title/message, переходы, multiline, форматирование и диапазоны. |
| Embed | URL/Replace, preview/player, cover sources, настройки, read-only и отмена загрузок. |
| Raw | Source/preview, отступы, Ctrl+Enter/Escape, sandbox, literal conversion. |
| Gallery | Источники, captions, reorder/remove, 21 layout, геометрия и настройки. |
| Carousel | Image/video/HTML, captions, navigation/counter, reorder, autoplay, inactive payloads. |
| Attaches | Источники файлов, filename, A/B/F/G, chooser, download, lifecycle URLs. |
| LinkPreview | URL/Enter/debounce, metadata ownership, семь templates, replacement и read-only. |
| Toggle | Title/body, открытие, multiline, merge, clipboard/conversion, read-only presentation. |
| Columns | Layout chooser, rich fields, 3→2 с сохранением текста/IDs, диапазоны и clipboard. |
| Spoiler | Label/body, reveal/hide, multiline, read-only, merge и преобразования. |
| Poll | Question/options, sort/type/results, local/remote vote, reset/abort/revisions, inline preservation. |
| Person | Вкладки/add/remove/reorder, avatar crop, name/role/bio/links, скрытые поля и inline identity. |

Общие native suites проверяют Move/Duplicate/Delete на каждом типе, все авторские поля, локальные и межблоковые диапазоны, форматирование, clipboard, частичные/целые преобразования и Undo/Redo. Plugin design suite проверяет filled/empty/read-only состояния в двух темах и двух ширинах; это геометрия и CSS, а не попиксельное сравнение v1/v2.

Функциональный паритет относится к пользовательским возможностям. Старые подписи API и сохранённый JSON не поддерживаются согласно действующей спецификации. Согласованное сохранение дополнительных авторских полей при whole conversion остаётся в силе.

## Архитектура

[Анализ импортов](test-results/audit-2026-10-07/architecture.json): 274 runtime-модуля, 671 локальная связь, ноль циклов и ноль нарушений проверенных границ. Анализ охватывает статические и литеральные динамические imports.

| Граница | Результат |
| --- | --- |
| Модель / проекция | Save из committed model; DOM синхронизируется в общей операции. Исправлены обход Poll и обработка скрытого rich text. |
| Транзакции / история | Один TransactionEngine; подготовка, commit, recovery и атомарный replay. Новые исправления используют существующие операции. |
| Расширения / ядро | Нет private-core imports у plugins, inline plugins/tools и plugin-kit; definitions и schemas фиксируются при регистрации. |
| Renderer / editing | Renderer не импортирует editing runtime/plugins; использует shared current-format/schema boundary. |
| Владение ресурсами | Revocable scopes/DataTasks, owner-document, abort, teardown и reference-counted styles; проверяются lifecycle и heap gate. |
| Формат данных | Один explicit current envelope, exact-version schemas, detached JSON, opaque unknown extensions; новый legacy runtime или migration layer не добавлены. |

**Архитектурный долг:** `DocumentRuntime.js` содержит 3059 строк и объединяет команды, ingress, подготовку clipboard и алгоритмы преобразования. Отдельный `DocumentIngestion` из первоначального разделения владельцев не выделен: его работа остаётся в `#ingest()` с общей `DocumentSchema`. Следующий разумный рефакторинг — выделить чистую сборку clipboard/selection plans и ingress, сохранив один TransactionEngine и существующий CanonicalTransforms. Это замечание сопровождения, не выявленная потеря функции.

Крупными остаются `inline-tools/utils.js` (984 строки), `InlineToolbar.js` (930), Mention (904) и Carousel (882). Сам размер не доказывает дефект, но усложняет независимую проверку владения состоянием. Исправления этого аудита не создают второй manager, history engine или специальные ветви ядра для встроенных имён.

## Окончательные проверки

| Проверка | Результат | Лог |
| --- | --- | --- |
| Node | 563 PASS, 0 FAIL, 0 skipped | [node-complete.log](test-results/audit-2026-10-07/node-complete.log) |
| TypeScript | Оба проекта PASS | [typecheck-complete.log](test-results/audit-2026-10-07/typecheck-complete.log) |
| Общий Chrome/native/heap | PASS; 25 страниц; 1844 cases / 38 groups, 0 FAIL; 21 sentinels, 0 retained | [browser-complete.log](test-results/audit-2026-10-07/browser-complete.log) |
| Npm consumer | Import/Vite/Bundler/NodeNext PASS; 273 declarations, 0 diagnostics; 22 CSS | [package-complete.log](test-results/audit-2026-10-07/package-complete.log) |
| Контракты / локали / README | PASS; 47 RU/EN pairs, 94 README, 92 упакованные копии | [contracts-complete.log](test-results/audit-2026-10-07/contracts-complete.log) |
| Production docs/demo | PASS; 123 страницы, 0 broken links, 0 missing assets; RU/EN × light/dark | [docs-complete.log](test-results/audit-2026-10-07/docs-complete.log) |
| Bundle gate | PASS; Paragraph 4.1/40, default 13.7/64, full 89.3/96 KiB gzip | [bundle-complete.log](test-results/audit-2026-10-07/bundle-complete.log) |
| Runtime dependency graph | PASS; 274 модуля, 671 связь, 0 cycles / violations | [architecture.log](test-results/audit-2026-10-07/architecture.log) |

Core gzip: 88.1 KiB. Размер ядра информационный по действующей спецификации; остальные preset budgets остаются обязательными. Исправлено противоречивое описание этого правила в browser README.

## Воспроизводимость и границы доказательства

[Snapshot](test-results/audit-2026-10-07/source-snapshot.json) содержит SHA-256 740 файлов: runtime, CSS, declarations, tests, scripts, presets и руководства. Итоговая сверка дала ноль несовпадений. [Вычисляемый итог](test-results/audit-2026-10-07/verification-summary.json) содержит результаты каждого native group, проверку полноты новых 29 регрессий и итог остальных gates. Heap gate: 21 sentinel, 0 retained, used heap 12.76 MiB.

Незавершённые native-попытки при изменении исходников, промежуточные ошибки RU README и параллельной упаковки не засчитываются как успешный аудит. Raw logs сохранены; окончательные результаты относятся только к указанным `*-complete.log`. `git diff --check` прошёл.

Проверяется Chrome/Chromium, включая native input/composition через CDP. Это не системная сессия IME ОС и не подтверждение Firefox/WebKit. Локальные upload/provider fixtures не доказывают доступность внешних серверов или реальное воспроизведение удалённого медиа. Heap gate проверяет свой сценарий очистки, а не отсутствие любых возможных утечек. Матрица широка, но не доказывает все произвольные сочетания расширений и последовательности действий.

Изменения остаются локальными, без commit/push.
