# Rector v2 — inline tools после преобразования, 05.10.2026

Продолжение: [проверка отступов, выделения и паритета](RECTOR_V2_SOURCE_INDENTATION_2026-10-05.md). Числа этого отчёта относятся к предыдущему срезу.

Продолжение [проверки последовательностей действий](RECTOR_V2_INTERACTION_SEQUENCES_2026-10-05.md) на базе `bb8f2c77493d79b94bc9ab2b84d6d5d544a10246`, ветка `refactor/rector-v2-architecture`.

## Найденные ошибки и исправления

| Ошибка | Итоговое поведение |
|---|---|
| После межблочного преобразования inline extension получал непустой Range, но пустой `selection.text`: native selection был свёрнут в конечную каретку. | InlineToolbar получает Range и text из одного фактического логического диапазона. Публичные `isActive` и `toggle` получают одинаковый выбранный текст. |
| Нажатие на поле ColorPicker очищало selectedIds и логический highlight. Браузерная каретка при этом оставалась в конце преобразованного текста, поэтому внешне потеря диапазона была незаметна до следующего действия. | SelectionController отличает UI inline toolbar от начала выделения документа. Поля получают native focus, сохраняя выделенный диапазон. Нажатие в документе или вне редактора продолжает работать по штатным правилам. |
| Изменение и сброс размера шрифта/фонового цвета восстанавливали native range до history gate. Undo терял конечную каретку преобразования; auxiliary focus также мог подменить исходное локальное выделение. | DOM range восстанавливается внутри существующей транзакции. Toolbar сохраняет логический bookmark своего контекста при auxiliary focus и передаёт его существующему `selectionBefore`. Undo возвращает исходную конечную каретку либо направление и границы локального выделения. |

Первые два исправления находятся в ядре. В Font size и Background изменён порядок восстановления DOM range; плагин по-прежнему владеет оформлением текста и своей панелью, ядро — логическим выделением и историей. Не добавлены второй runtime/selection engine, compat layer или отдельные ветки для типов блочных плагинов. Публичный API, envelope и JSON data не изменились.

Сверены [исторические контракты v1](test-results/refactor-retained-tools-2026-10-05/v1-contracts.json), revision `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`: text читался из cross range, а toolbar UI не очищал выделение как область документа. Это внешнее доказательство исходников; v2 runtime не импортирует v1. Восстановление исходного состояния истории проверяется также по P4 спецификации; наличие всех возможных правильных Undo-последовательностей у v1 здесь не утверждается.

## TDD и реальные действия

Использован [TDD skill](.agents/skills/tdd/SKILL.md). До исправлений воспроизведены продуктовые ошибки: [пустой text](test-results/refactor-retained-tools-2026-10-05/selection-text-red.log), [каретка Undo шрифта](test-results/refactor-retained-tools-2026-10-05/font-size-history-red.log), [Undo цвета](test-results/refactor-retained-tools-2026-10-05/background-history-red.log), [очистка диапазона полем цвета](test-results/refactor-retained-tools-2026-10-05/background-input-red.log).

Общий прогон выявил регрессию первого варианта правки: local Font size менял направление обратного выделения. Она сохранена в [red](test-results/refactor-retained-tools-2026-10-05/local-backward-red.log), исправлена сохранением toolbar bookmark и подтверждена [green](test-results/refactor-retained-tools-2026-10-05/local-backward-green.log). Ожидания направления не ослаблены. [Предыдущий source snapshot](test-results/refactor-retained-tools-2026-10-05/source-snapshot-before-local-fix.json) исторический; окончательные gates выполняются заново после этой коррекции.

Новая [native fixture](tests/browser/native-retained-tools.js) содержит **64 PASS** в [адресном прогоне](test-results/refactor-retained-tools-2026-10-05/retained-tools-green.log):

- inline extension context: два меню × два направления, 4;
- все 12 стандартных tools после преобразования: два меню × два направления, 48;
- сброс Font size/Background с сохранением курсива и текстовых краёв, 8;
- частичное локальное выделение через настоящее перетаскивание, auxiliary input, Apply, Undo/Redo в обоих направлениях, 4.

Проверяются committed JSON, DOM marks/styles, selectedIds, точные offsets/direction, editing focus, conversion end caret и атомарная история. Ввод поступает от собственного headless Chrome/CDP, без синтетических DOM drag/key событий и без видимых пустых окон Chrome. В ранней диагностике ColorPicker тест ошибочно ожидал autofocus; штатный сценарий требует реального нажатия поля. Этот отказ fixture не объявляется отдельным продуктовым багом.

## Окончательные проверки

| Проверка | Результат | Доказательство |
|---|---|---|
| Node / TypeScript | 436 PASS, 0 FAIL/skip; оба TS проекта PASS | [Node](test-results/refactor-retained-tools-2026-10-05/node.log), [types](test-results/refactor-retained-tools-2026-10-05/typecheck.log) |
| Trusted native input | **1291 PASS**, 0 FAIL; 21 группа, включая 64 новых случая | [Полная матрица](test-results/refactor-retained-tools-2026-10-05/native-all.log) |
| Browser contracts | 24 страницы PASS | [Контракты](test-results/refactor-retained-tools-2026-10-05/browser.log) |
| Heap / lifecycle | 21 sentinel, 0 retained; usedHeap 12.57 MiB | [Heap](test-results/refactor-retained-tools-2026-10-05/heap.log) |
| Package / consumer types | 266 declarations, 0 diagnostics; import/Vite/Bundler/NodeNext PASS; 22 CSS; 6 consumer type tests PASS | [Пакет](test-results/refactor-retained-tools-2026-10-05/package.log), [consumer types](test-results/refactor-retained-tools-2026-10-05/consumer-types.log) |
| Source / locales / docs | 47 EN/RU pairs; 94 README, 53 examples, 44 JSON, 62 links, 92 package copies PASS | [Документы](test-results/refactor-retained-tools-2026-10-05/docs.log) |
| Production docs/demo | 123 страницы, 0 broken links; RU/EN поведение и дизайн PASS | [Production](test-results/refactor-retained-tools-2026-10-05/docs-check.log) |
| Dev demo | RU/EN trusted QA PASS; 29 PNG, 0 missing assets | [Демо](test-results/refactor-retained-tools-2026-10-05/demo.log) |
| Bundle budgets | Paragraph 4.1/40, defaultInteractive 13.5/64, fullPreset 87.9/96 KiB gzip PASS; core 85.9 KiB информационно по решению владельца | [Размеры](test-results/refactor-retained-tools-2026-10-05/bundle.log) |

Повторена вся действующая матрица **21 блочного плагина и 12 inline tools**: native input/IME, каретка и keyboard navigation, локальные и межблочные диапазоны, преобразования и сохранность author data, clipboard, controls/settings, media/source, read-only, lifecycle и дизайн. Отказы отклонённых преобразований остаются атомарными. Решения владельца о сохранении всех авторских полей при переводе в текст и об одном Code со всем выбранным текстом сохранены.

Демо повторно проверено по реальным DOM и вводу в RU/EN и обеих темах: локализованные tooltip/hotkeys, положение conversion/H2–H6 menus, геометрия Move buttons, partial/cross conversion, end caret/retained range, single Image/Code target и отдельные media Settings. Просмотрены свежие [H2–H6 RU light](test-results/refactor-retained-tools-2026-10-05/demo/heading-ru-light.png) и [converted range RU](test-results/refactor-retained-tools-2026-10-05/demo/converted-range-ru.png).

Перед окончательными gates зафиксированы SHA-256 **572 исходников**. После всех процессов каждый совпал с [source snapshot](test-results/refactor-retained-tools-2026-10-05/source-snapshot.json). В окончательном прогоне исходники и fixtures не менялись. [Summary](test-results/refactor-retained-tools-2026-10-05/verification-summary.json) содержит фактически подсчитанные результаты, [manifest](test-results/refactor-retained-tools-2026-10-05/source-manifest.json) — hashes исходников, отчёта и доказательств. [Команды](test-results/refactor-retained-tools-2026-10-05/README.md) воспроизводимы; сборки запускались последовательно. Hashes относятся к локальным байтам до Git LF/CRLF normalization.

Подтверждена указанная матрица на Chrome; это не доказательство отсутствия ошибок во всех возможных последовательностях. Composition проверен протоколом Chrome; конкретные IME ОС и Firefox/Safari не проверены.

Демо: [http://127.0.0.1:5173/ru/#demo](http://127.0.0.1:5173/ru/#demo).
