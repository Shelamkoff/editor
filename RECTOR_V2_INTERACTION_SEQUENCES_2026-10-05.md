# Повторная проверка последовательностей действий Rector v2 — 2026-10-05

База: 252d0d800bcbf45939978453c636c186ef39f2e1; ветка refactor/rector-v2-architecture. Продолжение [сверки эквивалентности](RECTOR_V2_EQUIVALENCE_AUDIT_2026-10-05.md). Матрица возможностей v1 → v2 остаётся в [отчёте по плагинам](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md); новый проход проверяет её повторно и расширяет последовательности команд после преобразования.

## Исправления

| Ошибка | Исправленное поведение |
|---|---|
| Отменённое нажатие «Добавить» оставляло захваченный межблочный bookmark. После нового локального выделения открытие тюна через Enter преобразовывало прежний диапазон. | Захват относится к завершающему нажатию мыши. Следующий mouse down отменяет pending capture; Enter/Space заново читают текущее выделение. Непервичная кнопка мыши не создаёт pending capture. Document listener снимается при destroy. |
| H2–H6 после межблочного преобразования захватывал только native end caret и терял логический диапазон. | Меню уровня сохраняет полный logical bookmark, включая conversionCaret, и восстанавливает его до транзакции. Изменение тега заголовка, последующее форматирование и Undo/Redo сохраняют выбранный интервал и конечную каретку. |

Оба исправления находятся в ядре: BlockToolbar и InlineToolbar. Heading по-прежнему владеет данными и действием смены уровня; отдельная новая логика выбора для этого плагина не добавлена. Используются существующие selection port и runtime.interact. Публичный API и формат документа не изменены.

Дополнительно проверен настоящий буфер обмена Chrome после преобразования: copy, cut и paste используют весь сохранённый диапазон при collapsed native caret. Части с авторскими marks передаются между независимыми редакторами через private MIME. Paste заменяет выбранный интервал; один Undo возвращает данные и диапазон. Отдельного исправления ClipboardController не потребовалось.

## TDD и новые сценарии

Использован [TDD skill](.agents/skills/tdd/SKILL.md). [Отменённый жест — red](test-results/refactor-interaction-sequences-2026-10-05/cancelled-menu-red.log), [H2–H6 — red](test-results/refactor-interaction-sequences-2026-10-05/heading-control-red.log) воспроизводят продуктовые ошибки до исправлений. [Адресный итог](test-results/refactor-interaction-sequences-2026-10-05/interaction-sequences-green.log) содержит 24 PASS:

- copy/cut/paste после преобразования: оба меню × оба направления, 12 случаев;
- отменённый Add → новое локальное выделение → тюн через Enter/Space: 4;
- преобразование → H2–H6 → форматирование/история: оба меню × оба направления, 4;
- Escape после открытия уровня: 2;
- клавиатурное меню уровня на исходном cross-field диапазоне, направление и история: 2.

Проверки используют физический CDP ввод, trusted clipboard events, committed JSON, DOM marks, selectedIds, положение каретки и историю. Видимые/пустые окна Chrome не создаются.

Промежуточные отказы проверок не объявляются дополнительными багами: пустой bold wrapper после Cut не содержит выбранного текста; Paste сохраняет inherited mark; активный Bold на первом фрагменте снимается общей командой. Escape возвращает фокус кнопке меню, поэтому следующий форматирующий жест проверяется кнопкой Italic. Новый локальный drag начинается вне предыдущего native range, чтобы Chrome не запускал drag выбранного текста. Эти условия не ослабляют red-проверки двух исправленных дефектов.

## Итоговые проверки окончательного кода

| Проверка | Результат | Доказательство |
|---|---|---|
| Node / TypeScript | 436 PASS, 0 FAIL/skip; оба TS проекта PASS | [Node](test-results/refactor-interaction-sequences-2026-10-05/node.log), [types](test-results/refactor-interaction-sequences-2026-10-05/typecheck.log) |
| Trusted native input | 1227 PASS, 0 FAIL; 20 групп ядра и плагинов, включая 24 новых случая | [Матрица](test-results/refactor-interaction-sequences-2026-10-05/native-all.log) |
| Browser contracts | 24 страницы PASS | [Контракты](test-results/refactor-interaction-sequences-2026-10-05/browser.log) |
| Heap / lifecycle | 21 sentinel, 0 retained; usedHeap 12.57 MiB | [Heap](test-results/refactor-interaction-sequences-2026-10-05/heap.log) |
| Build / package / consumer types | 266 declarations без diagnostics, 22 CSS, импорт/Vite/Bundler/NodeNext PASS; 6 consumer tests PASS | [Пакет](test-results/refactor-interaction-sequences-2026-10-05/package.log), [consumer types](test-results/refactor-interaction-sequences-2026-10-05/consumer-types.log) |
| Source / locales / docs | 47 EN/RU pairs; 94 README, 53 examples, 44 JSON, 62 links, 92 package copies PASS | [Документы](test-results/refactor-interaction-sequences-2026-10-05/docs.log) |
| Production docs/demo | 123 страницы, 0 broken links; RU/EN поведение и дизайн PASS | [Production](test-results/refactor-interaction-sequences-2026-10-05/docs-check.log) |
| Dev demo | RU/EN trusted QA PASS; 29 PNG, 0 missing assets | [Демо](test-results/refactor-interaction-sequences-2026-10-05/demo.log) |
| Bundle budgets | Paragraph 4.1/40, defaultInteractive 13.5/64, fullPreset 87.9/96 KiB gzip PASS; core 85.9 KiB — информационно по решению владельца | [Размеры](test-results/refactor-interaction-sequences-2026-10-05/bundle.log) |

Повторены группы каждого из 21 плагинов: поля и переходы каретки, локальные/межблочные диапазоны, конвертация всех целей, clipboard, controls/settings, sources/media, read-only, lifecycle и дизайн. 12 стандартных inline tools проходят native suite. Изменения политики конвертации не вносились: сохраняются решения владельца о всех авторских полях при переводе в текст и об одном Code со всем выбранным текстом.

Действующее демо повторно проверено в RU/EN и обеих темах: локализованные tooltips с hotkeys, положение меню вне toolbar, H2–H6, Move и геометрия кнопок, частичное/межблочное преобразование, retained range, одна цель Code/Image, Undo/Redo и отдельные media Settings. Просмотрены новые [H2–H6 RU light](test-results/refactor-interaction-sequences-2026-10-05/demo/heading-ru-light.png) и [сохранённый диапазон RU](test-results/refactor-interaction-sequences-2026-10-05/demo/converted-range-ru.png). Остальные снимки доступны в папке demo.

Перед общим browser/native прогоном зафиксированы SHA-256 **570 исходников**; после всех проверок каждый совпал с [снимком](test-results/refactor-interaction-sequences-2026-10-05/source-snapshot.json). Код и fixtures в этом прогоне не менялись. [Manifest](test-results/refactor-interaction-sequences-2026-10-05/source-manifest.json) фиксирует исходники и окончательные доказательства; [summary](test-results/refactor-interaction-sequences-2026-10-05/verification-summary.json) содержит фактические counts. Обязательные gates запускались последовательно, чтобы npm test и package gate не пересобирали dist одновременно. Хеши относятся к локальным байтам до нормализации LF/CRLF в Git.

Подтверждена перечисленная матрица на Chrome и исправлены два дополнительных дефекта ядра. Это не доказательство отсутствия ошибок во всех возможных последовательностях. Исторический oracle v1 остаётся внешним доказательством предыдущего прохода; новый runtime не импортирует v1. IME здесь проверен протоколом Chrome; Firefox/Safari и конкретные системные IME не проверены.

Демо: [http://127.0.0.1:5173/ru/#demo](http://127.0.0.1:5173/ru/#demo).
