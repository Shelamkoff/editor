# Rector v2 — продолжение редактирования после преобразования, 05.10.2026

Продолжение [предыдущего аудита](RECTOR_V2_RETAINED_TOOLS_AUDIT_2026-10-05.md) на базе `9df0db9f8177fb68a54de2a5079a3539ce547879`, ветка `refactor/rector-v2-architecture`.

## Найденные ошибки

| Сценарий | До исправления | После исправления |
|---|---|---|
| Преобразовать межблочный диапазон в Heading → End → набрать X. | Если каретка уже находилась в конце, логический диапазон оставался активным. X заменял весь преобразованный текст. | Навигация без Shift снимает логический диапазон, даже если native caret не сдвинулся. X вставляется у каретки; Undo не возвращает явно снятое выделение. |
| Открыть Background → нажать поле цвета → Escape → продолжить ввод. | Палитра закрывалась, фокус уходил на BODY. Видимое выделение сохранялось, но следующий ввод не изменял документ. | Escape закрывает панель и возвращает редактору текущий логический диапазон, направление и фокус. После преобразования сохраняется конечная каретка. Черновой цвет не применяется и не добавляет историю. |

Первый дефект находится в `KeyboardRouter`: навигация без Shift теперь снимает любой активный логический диапазон, включая удержанный после преобразования. Shift-навигация продолжает расширять выделение; auxiliary controls и menu navigation обрабатывает их владелец.

Для второго исправления ядро предоставляет mounted inline control необязательный `InlineMutationContext.restoreSelection(): boolean`. Он восстанавливает текущий bookmark через существующий selection controller, без изменения модели/истории. Background перехватывает Escape своей палитры и обращается к координатору; отдельный контроль без координатора восстанавливает живой Range. Listener снимается при destroy. Публичные типы и документация RU/EN обновлены. Проверены read-only, render с новым и тем же ID, destroy: старый диапазон не получает полномочия нового документа.

Блочные плагины не получили новых веток по именам. JSON/envelope и решения владельца о сохранении авторских полей, одном Code с полным выбранным текстом и отдельной Image Settings сохранены. Второй runtime, history store, text engine или compat layer не добавлены.

## Сравнение с v1

[Историческая браузерная проверка](test-results/refactor-conversion-continuations-2026-10-05/v1-continuations.log) выполняет те же реальные drag/click/key действия на v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`, forward/backward:

- End → X в v1 даёт `Al / pha / BraX / vo`. Это подтверждает дефект переноса в v2.
- Background → Escape в v1 также отдаёт фокус BODY и теряет следующий ввод. Этот унаследованный баг исправлен в v2 по требованию искать ошибки; он не сохраняется ради буквального повторения дефекта.
- Перед продолжением обе версии одинаково преобразуют выбранный диапазон в `Paragraph Al / Heading pha / Heading Bra / Paragraph vo`.

[240 runtime JS/CSS источников v1](test-results/refactor-conversion-continuations-2026-10-05/v1-source-snapshot.json) сверены с Git. LF/CRLF нормализованы только для сравнения текста; Git/local byte hashes записаны отдельно. Oracle использует локально установленные зависимости. Он находится в исключённой папке доказательств и не входит в production imports или штатную матрицу v2.

## TDD и фактические действия

Применены [TDD](.agents/skills/tdd/SKILL.md) и [Modern JavaScript](.agents/skills/modern-javascript-patterns/SKILL.md).

Продуктовые Red: [потеря фокуса](test-results/refactor-conversion-continuations-2026-10-05/background-focus-red.log), [потеря ввода после Escape](test-results/refactor-conversion-continuations-2026-10-05/background-input-red.log), [End заменяет старый диапазон](test-results/refactor-conversion-continuations-2026-10-05/caret-end-red.log). Затем отдельные Green: [Background](test-results/refactor-conversion-continuations-2026-10-05/background-cancel-green.log), [End](test-results/refactor-conversion-continuations-2026-10-05/caret-end-green.log).

[Новая fixture](tests/browser/native-conversion-continuations.js) содержит **65 сценариев**:

- отмена и подтверждение IME после преобразования — 8;
- отмена Background, повторное открытие одним нажатием, следующий ввод и история — 4;
- End/Home/Left/Right и Ctrl-навигация, включая движение, ограниченное текущим краем — 24;
- ввод, Delete/Backspace/Ctrl+Delete, Enter и Shift+Enter после преобразования — 24;
- исходные локальные и межблочные диапазоны, точное направление после отмены Background и Undo — 4;
- публичный mounted context и отзыв полномочий — 1.

Оба меню преобразования и оба направления выделения проверены. Проверяются committed JSON, DOM, focus, offsets, selected IDs и атомарная история; trusted mouse/key input поступает от собственного headless Chrome/CDP. Видимые окна Chrome не открываются. IME проверяет движок Chrome через CDP; его compositionstart/update trusted, engine-generated completion помечен Chrome как untrusted.

При расширении fixture обнаружена ошибка самой проверки: после удаления и Undo она читала прежний DOM-элемент восстановленного блока. Проверка исправлена чтением текущего поля по public block ID; ожидания направления не изменены. Это не объявляется отдельным продуктовым багом.

## Итоговые проверки

| Проверка | Результат | Доказательство |
|---|---|---|
| Node / TypeScript | 436 PASS, 0 FAIL/skip; оба TS проекта PASS | [Node](test-results/refactor-conversion-continuations-2026-10-05/node.log), [types](test-results/refactor-conversion-continuations-2026-10-05/typecheck.log) |
| Native browser matrix | **1356 PASS**, 0 FAIL; 22 группы, включая 65 новых случаев | [Полная матрица](test-results/refactor-conversion-continuations-2026-10-05/native-all.log) |
| Browser contracts / heap | 24 страницы PASS; 21 sentinel, 0 retained; usedHeap 12.57 MiB | [Browser](test-results/refactor-conversion-continuations-2026-10-05/browser.log), [heap](test-results/refactor-conversion-continuations-2026-10-05/heap.log) |
| Package / consumer types | 266 declarations, 0 diagnostics; import/Vite/Bundler/NodeNext PASS; 22 CSS; 6 consumer tests PASS | [Пакет](test-results/refactor-conversion-continuations-2026-10-05/package.log), [consumer](test-results/refactor-conversion-continuations-2026-10-05/consumer-types.log) |
| Source / locales / docs | 47 RU/EN pairs, 94 README, 53 examples, 44 JSON, 62 links, 92 package copies PASS | [Docs](test-results/refactor-conversion-continuations-2026-10-05/docs.log) |
| Production / dev demo | 123 страницы, 0 broken links; RU/EN QA PASS, 29 fresh PNG, 0 missing assets | [Production](test-results/refactor-conversion-continuations-2026-10-05/docs-check.log), [dev demo](test-results/refactor-conversion-continuations-2026-10-05/demo.log) |
| Bundle budgets | Paragraph 4.1/40, defaultInteractive 13.7/64, fullPreset 87.8/96 KiB gzip PASS; core 86.0 KiB информационно по решению владельца | [Bundle](test-results/refactor-conversion-continuations-2026-10-05/bundle.log) |

Свежие снимки просмотрены: [converted range RU](test-results/refactor-conversion-continuations-2026-10-05/demo/converted-range-ru.png), [Heading menu EN dark](test-results/refactor-conversion-continuations-2026-10-05/demo/heading-en-dark.png). Меню не перекрывает toolbar; после преобразования видны удержанный диапазон и конечная каретка.

Повторена действующая матрица **21 блочного плагина и 12 inline tools**: ядро, клавиатура/каретка/IME, локальные/межблочные выделения, частичные и межблочные преобразования, author data/inline preservation, clipboard, settings/controls/media/source, read-only/lifecycle и дизайн. Новые 65 сценариев включены в полный runner.

Зафиксированы SHA-256 **574 исходников**. После всех проверок каждый совпал с [окончательным snapshot](test-results/refactor-conversion-continuations-2026-10-05/source-snapshot.json). Между non-browser gates и final browser/native gates добавлена только проверка same-ID revocation в новой fixture; продуктовые, типовые и документационные исходники не менялись. [Предыдущий snapshot](test-results/refactor-conversion-continuations-2026-10-05/source-snapshot-before-scope-assertion.json) сохранён.

[Summary](test-results/refactor-conversion-continuations-2026-10-05/verification-summary.json) содержит фактически подсчитанные результаты; [summarize.mjs](test-results/refactor-conversion-continuations-2026-10-05/summarize.mjs) проверяет raw logs, historical observations и source hashes. [Manifest](test-results/refactor-conversion-continuations-2026-10-05/source-manifest.json) фиксирует исходники, отчёт и доказательства. [Команды](test-results/refactor-conversion-continuations-2026-10-05/README.md) воспроизводимы. Hashes относятся к локальным байтам до Git LF/CRLF normalization.

Это подтверждение указанной матрицы на Chrome, не доказательство отсутствия ошибок во всех возможных действиях. Демо: [http://127.0.0.1:5173/ru/#demo](http://127.0.0.1:5173/ru/#demo).
