# Rector v2 — отмена панелей, фокус и контраст индикатора, 05.10.2026

Продолжение [предыдущего аудита](RECTOR_V2_CONVERSION_CONTINUATIONS_2026-10-05.md) на базе 93e6d3bee9cc6f658c235cb5d76aa394529bd09a, ветка refactor/rector-v2-architecture.

## Исправленные ошибки

| Сценарий | До исправления | После исправления |
|---|---|---|
| Font Size → ввести черновой размер → Tab на Apply, Reset или пресет → Escape. | Escape обрабатывался только полем ввода; с кнопки панель оставалась открыта и фокус не возвращался в текст. | Escape отменяет панель с любого её элемента, возвращает диапазон ядра и фокус. Черновик не применяется и не создаёт историю. |
| Link → ввести URL → Tab на Apply либо Shift+Tab на Back → Escape. | С кнопки Escape не закрывал drill-down. Следующий ввод не доходил до выбранного текста. | Общий обработчик панели закрывает её и восстанавливает сохранённое выделение; ввод и Undo работают. |
| Открыть Align или Script → управлять с клавиатуры. | Панель не получала фокус. Tab уходил в другой документный блок, поэтому пользователь не мог продолжить работу в открытой панели. | Тулбар фокусирует доступное поле либо кнопку панели, Tab достигает действий, Escape возвращает выделение в редактор. |
| Белый индикатор Background на белом тулбаре светлой темы. | Цвет индикатора совпадал с поверхностью; границы не было. Кнопка выглядела пустой. | Тематический контур через box-shadow и существующий oe-text-3 сохраняет видимость и размеры индикатора. |

Font Size использует уже существующий optional mounted restoreSelection. Он не разворачивает native end caret после преобразования и не использует старый Range, когда координатор отказал в восстановлении. Standalone fallback сохранён.

InlineToolbar использует общий guarded closePanel, проверяет текущие selection/action leases, generation и экземпляры владельцев. Обработчик Escape снимается при закрытии. preventDefault() или stopPropagation() собственного контрола сохраняют его право обработать Escape. Retained panel и callbacks не получают полномочия same-ID successor.

Новых веток ядра по именам блочных плагинов, второго runtime/history/text engine или compat layer нет. JSON/envelope и публичные типы сохранены. RU/EN документация поведения панелей обновлена. Сохранение всех авторских полей, один Code с выбранным текстом и отдельная Image Settings остаются закреплёнными решениями владельца.

## Сверка с v1

[10 исторических native сценариев](test-results/refactor-panel-continuations-2026-10-05/v1-panels-final.log) на v1 5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340 подтвердили все четыре дефекта. Это унаследованные ошибки, исправленные по требованию искать баги; их повторение не закрепляется ради буквального паритета.

В v1 Font Size и Link остаются открыты после Escape с Apply. Align/Script не получают фокус; после Tab ввод X попадает в следующий Paragraph. Белый Background в светлой теме не различим на тулбаре. В тёмной теме исходный белый индикатор виден.

Oracle также фиксирует public inlineTools policy всех 21 плагина. У Image, Embed, Gallery, Carousel, Poll и Person rich author fields доступны для ввода/преобразования, но форматирование отключено, как в v1. Это не ошибка переноса. Проверки отмены панелей выполняются там, где инструменты разрешены.

[240 JS/CSS sources v1](test-results/refactor-panel-continuations-2026-10-05/v1-source-snapshot.json) сверены с Git после нормализации LF/CRLF; local/Git byte hashes записаны отдельно. Исторический runtime находится только в исключённой папке доказательств и не входит в production imports или штатную матрицу v2.

## TDD и реальное поведение

Использованы [TDD](.agents/skills/tdd/SKILL.md) и [Modern JavaScript](.agents/skills/modern-javascript-patterns/SKILL.md). Подтверждённые Red: [Font Size](test-results/refactor-panel-continuations-2026-10-05/font-button-red.log), [Link](test-results/refactor-panel-continuations-2026-10-05/link-button-red.log), [фокус Align](test-results/refactor-panel-continuations-2026-10-05/action-focus-confirmed-red.log), [контраст Background](test-results/refactor-panel-continuations-2026-10-05/swatch-red.log). После каждого исправления выполнен адресный Green, затем общая матрица.

Добавлены 166 сценариев в четыре страницы полного native runner:

- Font Size: отмена в 18 полях десяти плагинов в обоих направлениях — 36; ввод и история в 11 полях шести плагинов с отключённым форматированием — 22.
- Background и Link: отмена в каждом из 18 доступных полей в обоих направлениях, ввод и Undo/Redo — по 36.
- Клавиатура панелей: Apply/Reset/пресет/Back, Align/Script, local/cross/backward, converted interval/end caret — 32; собственный Escape и same-ID revocation — 2; видимость индикатора и работа палитры в обеих темах — 2.

Жесты drag/click/Tab/key/Escape передаёт собственный headless Chrome/CDP. Public blocks.focus используется только для доступа к нужному полю в setup. Проверяются committed JSON всего блока, соседние поля и assets, DOM/focus/offsets/direction, selected IDs и атомарная история. Синтетические DOM mouse/key события и видимые окна Chrome не используются.

Ранние ошибки fixture (селекторы hidden/main panel, перестановка каретки при чтении Undo, baseline истории после render) исправлены до окончательного прогона и не выдаются за продуктовые Red. После уточнения селектора Align отдельно воспроизведён настоящий Red без исправления фокуса. Промежуточный сбой native input bridge не считался продуктовым дефектом; отдельный повтор и окончательная общая матрица прошли.

## Итоговые gates

| Проверка | Результат | Лог |
|---|---|---|
| Node / TypeScript | 436 PASS, 0 FAIL/skip; оба TS проекта PASS | [Node](test-results/refactor-panel-continuations-2026-10-05/node-final.log), [TS](test-results/refactor-panel-continuations-2026-10-05/typecheck-final.log) |
| Native browser matrix | 1522 PASS, 0 FAIL; 26 групп | [Native](test-results/refactor-panel-continuations-2026-10-05/native-all.log) |
| Browser contracts / heap | 24 страницы PASS; 21 sentinel, 0 retained; usedHeap 12.57 MiB | [Browser](test-results/refactor-panel-continuations-2026-10-05/browser-final.log), [Heap](test-results/refactor-panel-continuations-2026-10-05/heap-final.log) |
| Package / consumers | 266 declarations, 0 diagnostics; import/Vite/Bundler/NodeNext PASS; 22 CSS; 6 consumer tests PASS | [Package](test-results/refactor-panel-continuations-2026-10-05/package-final.log), [Consumers](test-results/refactor-panel-continuations-2026-10-05/consumer-types-final.log) |
| Docs / locales | 47 RU/EN pairs, 94 README, 53 examples, 44 JSON, 62 links, 92 package copies PASS | [Docs](test-results/refactor-panel-continuations-2026-10-05/docs-after-swatch.log) |
| Production / dev demo | 123 страницы, 0 broken links; RU/EN обе темы, 0 missing assets; 29 свежих PNG | [Production](test-results/refactor-panel-continuations-2026-10-05/docs-check-after-swatch.log), [Dev](test-results/refactor-panel-continuations-2026-10-05/demo-final.log) |
| Bundle | Paragraph 4.1/40, defaultInteractive 13.7/64, fullPreset 87.8/96 KiB gzip PASS; core 86.1 KiB информационно по решению владельца | [Bundle](test-results/refactor-panel-continuations-2026-10-05/bundle-final.log) |

Повторена полная действующая матрица поведения/дизайна 21 блочного плагина и 12 default inline tools: ядро, каретка/IME, local/cross selection, partial/cross conversion, controls/settings/source/media/clipboard, read-only/lifecycle, обе темы. Новые 166 сценариев включены в общий runner.

Просмотрены свежие [tooltip RU dark](test-results/refactor-panel-continuations-2026-10-05/demo-final/tooltip-ru-dark.png) и [Heading EN light](test-results/refactor-panel-continuations-2026-10-05/demo-final/heading-en-light.png): локализованный tooltip/shortcut, меню вне тулбара и различимый белый индикатор.

[580 исходников](test-results/refactor-panel-continuations-2026-10-05/source-snapshot.json) зафиксированы до окончательных gates и совпали после них. Сохранены два идентичных предыдущих snapshots перед исправлением контраста индикатора. source-snapshot-before-doc-format.json сохраняет исходное имя, но фактически уже содержит исправленный markup RU/EN документации; это проверено по hashes, а не предполагается по имени файла. Первый проход 1520 случаев сохранён отдельно; после изменения CSS и двух новых визуальных случаев все gates повторены, итоговый native проход содержит 1522.

[Summary](test-results/refactor-panel-continuations-2026-10-05/verification-summary.json) подсчитан из raw logs; [summarize.mjs](test-results/refactor-panel-continuations-2026-10-05/summarize.mjs) проверяет counts, historical observations и source hashes. [Manifest](test-results/refactor-panel-continuations-2026-10-05/source-manifest.json) фиксирует исходники, отчёты и доказательства. [Команды](test-results/refactor-panel-continuations-2026-10-05/README.md) воспроизводимы. Hashes относятся к локальным байтам до Git LF/CRLF normalization.

Это подтверждение указанной матрицы на Chrome. Проверка не доказывает отсутствие ошибок во всех возможных последовательностях или браузерах. Демо: [127.0.0.1:5173/ru/#demo](http://127.0.0.1:5173/ru/#demo).
