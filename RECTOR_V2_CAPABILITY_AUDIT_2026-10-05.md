# Повторная сверка функций Rector v2 — 2026-10-05

Актуальное продолжение: [проверка Move, конверсии и Image от 05.10.2026](RECTOR_V2_MOVE_CONVERSION_AUDIT_2026-10-05.md). Числа ниже описывают предыдущий checkpoint; новые замечания и расширенные сценарии приведены в продолжении.

База этого прохода: `a9ecb53054a145fa2086cfa5f84ec91d047eb6fa`. Ветка: `refactor/rector-v2-architecture`. Oracle v1: локальный `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`. Нормативная архитектура — [спецификация](RECTOR_V2_REMEDIATION_SPEC.md), перечень возможностей каждого из 21 плагина — [матрица паритета](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md). Этот проход повторяет всю матрицу после исправлений общих UI-контекстов.

Итог: все перечисленные возможности матрицы 21 плагина повторно проверены. 982 native cases и 431 Node test прошли; пройдены типы, сборка, пакет, документация и настоящее демо. Это подтверждение проверенной матрицы Chrome, а не доказательство отсутствия всех возможных ошибок. [Машинный итог](test-results/refactor-capabilities-2026-10-05/verification-summary.json).

## Что найдено и исправлено

- Закрытая action panel могла выполнить сохранённый producer до следующего `selectionchange`. Контекст также мог выровнять новый документ с повторными ID. Теперь закрытие, смена документа, режима или владельца навсегда отзывают его: producer не вызывается, старые restore/close/tooltip callbacks не влияют на последующую панель.
- После преобразования блока и Undo ID и тип возвращаются, но экземпляр уже другой. Прежние action/settings contexts и пункты обоих меню всё ещё могли менять его: выравнивать, преобразовывать, удалять или вставлять рядом блок. Теперь они связаны с конкретными смонтированными проекциями, а не только ID/типом. Обычные обновления данных прежнего экземпляра продолжают работать.
- Вспомогательный контекст `SettingsPanelCapability` мог вызвать `updateData` после закрытия панели. Теперь он отзывается при закрытии, замене экземпляра/документа, read-only, destruction и ошибке фабрики. `getData` отозванного контекста возвращает последний собственный снимок и не читает нового владельца. Возврат в editable mode не оживляет старый контекст.
- Перенос выделения из открытой Link panel в другой непустой диапазон оставлял старую панель поверх основных инструментов. Новое выделение закрывает прежние action/type/level menus; следующий инструмент действует только на текущий диапазон и создаёт один шаг истории.
- В Heading не были перенесены ArrowDown/ArrowUp на кнопке уровней, стрелка раскрытия, локализованное доступное имя и выбранное состояние пункта. Восстановлены H2–H6, вход с первой/последней позиции, Home/End/wrap/Escape, Enter, сохранение выделения и атомарный Undo/Redo. Необязательный локализованный `SettingsActionCapability.label` проходит неизменяемый snapshot реестра; `active` показывает выбранное состояние радиопункта.
- Align сохранял состояние последней открытой панели и до её открытия показывал левое выравнивание даже на центрированном блоке. Теперь иконка, активность и локализованная подсказка обновляются при смене выделения из канонического снимка `InlineSelection.textAlign`; открывать панель для этого не требуется. Проверены RU/EN, переходы center → left → right и настоящий hover.
- Меню преобразования перекрывало тулбар: был потерян вызов позиционирования из v1. Оба inline меню располагаются с зазором 4 px ниже панели, при нехватке места — выше, с ограничением по доступной высоте и ширине окна. Поиск пересчитывает геометрию. Добавлен собственный `border-box` для корректной работы без CSS reset приложения.
- После ввода в поиск меню Escape терял авторское выделение. Escape и повторное нажатие кнопки меню возвращают исходный диапазон; закрытие не создаёт запись истории. Проверены 21 пункт, последний пункт с клавиатуры, поиск и обе панели в окне 390×340 у верхнего, правого и нижнего края.
- Ошибка фабрики отзывается в пределах её собственной панели. Recovery и сохранённые callbacks ошибочной фабрики не закрывают новую панель, открытую во время callback.

Изменения реализованы в существующих `InlineToolbar`, `BlockToolbar` и capability registry. Менеджеры v1, второй runtime или compatibility adapters не подключались. DOM используется как локальный идентификатор смонтированного владельца, не как сериализованные авторские данные. Сохранение всех авторских полей при whole conversion остаётся согласованным отличием от v1.

## TDD и границы проверок

Добавлен 31 native case: tools 33 → 41, menus 8 → 31. Проверяются публичные extension contexts и Editor API, сохранённая модель, диапазон, focus, история и доступное состояние меню. Панели открываются настоящими кликами/клавишами; replay сохранённых callbacks в fixture позволяет проверить отзыв до следующего асинхронного события выделения.

До соответствующих исправлений сохранены red:

- [закрытие action panel](test-results/refactor-capabilities-2026-10-05/action-closure-red.log), [новый документ](test-results/refactor-capabilities-2026-10-05/action-generation-red.log), [смена выделения](test-results/refactor-capabilities-2026-10-05/selection-panel-red.log), [ошибка фабрики](test-results/refactor-capabilities-2026-10-05/action-factory-successor-red.log).
- [клавиатура Heading](test-results/refactor-capabilities-2026-10-05/heading-keyboard-red.log), [доступное меню RU/EN](test-results/refactor-capabilities-2026-10-05/heading-semantics-red.log), [старый уровень](test-results/refactor-capabilities-2026-10-05/heading-generation-red.log), [старое преобразование](test-results/refactor-capabilities-2026-10-05/conversion-generation-red.log).
- [закрытая settings panel](test-results/refactor-capabilities-2026-10-05/block-panel-closure-red.log), [Delete/Insert после render](test-results/refactor-capabilities-2026-10-05/block-menu-generation-red.log).
- [settings context после Undo](test-results/refactor-capabilities-2026-10-05/block-panel-owner-red.log), [action context после Undo](test-results/refactor-capabilities-2026-10-05/action-owner-red.log), [общие меню после Undo](test-results/refactor-capabilities-2026-10-05/block-menu-owner-red.log), [inline меню после Undo](test-results/refactor-capabilities-2026-10-05/inline-menu-owner-red.log).

Дополнительные red: [состояние Align RU/EN](test-results/refactor-capabilities-2026-10-05/align-selection-red.log), [перекрытие тулбара](test-results/refactor-capabilities-2026-10-05/inline-position-red.log), [геометрия без CSS reset](test-results/refactor-capabilities-2026-10-05/inline-position-viewport-red.log), [выделение после поиска](test-results/refactor-capabilities-2026-10-05/inline-filter-selection-red.log). В первом viewport red также были три ошибки фикстуры: Escape отправлялся в кнопку вместо самого меню; перед итоговым прогоном исправлен фокус. Ошибки геометрии в этом логе и отдельные red перекрытия/выделения воспроизводят реальные дефекты.

Итоговые suites (выгрузки из общего native-прогона): [41 tools PASS](test-results/refactor-capabilities-2026-10-05/native-tools.log), [31 menus PASS](test-results/refactor-capabilities-2026-10-05/native-block-menus.log). Ожидаемые red не являются результатом итоговых gates.

Первый параллельный прогон остановился на группировке Undo после двух символов XY в первом поле Checklist: [лог отказа](test-results/refactor-capabilities-2026-10-05/native-first.log). [Отдельное воспроизведение](test-results/refactor-capabilities-2026-10-05/checklist-input-reproduce.log) прошло. Группировка ввода имеет окно 300 ms; нагрузка параллельной сборки — возможное объяснение, которое не подтверждено измерением интервала событий. Поведение coalescing не менялось. Окончательный общий native-прогон выполнен отдельно от сборок: 982 PASS, 0 FAIL. Промежуточный повтор был прерван для исправления вновь обнаруженных contexts; он не учитывается как PASS.

## Общие gates

| Проверка | Результат | Доказательство |
|---|---|---|
| Node / TypeScript | 431 PASS, 0 FAIL/skip; оба TS-проекта PASS | [node](test-results/refactor-capabilities-2026-10-05/node.log), [types](test-results/refactor-capabilities-2026-10-05/typecheck.log) |
| Native | 982 PASS, 0 FAIL; все 21 плагин | [native](test-results/refactor-capabilities-2026-10-05/native-full.log) |
| Browser CLI | 24 страницы PASS | [browser](test-results/refactor-capabilities-2026-10-05/browser-full.log) |
| Heap | 21 sentinel, 0 retained; usedHeap 12.50 MiB | [heap](test-results/refactor-capabilities-2026-10-05/heap.log) |
| Build / consumer types | 264 declarations, 0 diagnostics; 6 PASS | [build](test-results/refactor-capabilities-2026-10-05/build.log), [consumer types](test-results/refactor-capabilities-2026-10-05/test-types.log) |
| Checkout package | Tarball/import/Vite/Bundler/NodeNext, 22 CSS PASS | [package](test-results/refactor-capabilities-2026-10-05/test-package.log) |
| Contracts/source/locales/docs | 47 EN/RU pairs, 94 readmes, 53 examples, 44 JSON, 62 links, 92 package copies PASS | [contracts](test-results/refactor-capabilities-2026-10-05/test-docs.log) |
| Production docs | 123 pages, 0 broken links/missing assets; RU/EN Heading/conversion/tooltip × обе темы; Align PASS | [production](test-results/refactor-capabilities-2026-10-05/docs-check.log) |
| Dev demo | RU/EN; меню и подсказки в обеих темах; Align, поиск/Mention, Image/Carousel QA PASS | [demo](test-results/refactor-capabilities-2026-10-05/demo-visual.log) |

JS/CSS, declarations и исполняемые fixtures зафиксированы перед итоговыми gates; SHA-256 всех 556 файлов совпали до и после. [Снимок исходников](test-results/refactor-capabilities-2026-10-05/source-snapshot.json), [манифест исходников и доказательств](test-results/refactor-capabilities-2026-10-05/source-manifest.json). В русской prose документации исправлены два термина, отклонённых docs gate; итоговая production-проверка после этого прошла.

## Дизайн и реальное демо

Design matrix повторно проверяет 21 плагин × 2 темы × 640/288 px × filled/empty/read-only/empty-read-only: 84 комбинации, 336 состояний. Это CSS/геометрия/состояния; автоматический pixel diff с v1 не выполняется. Настоящий dev/production demo отдельно проверяет отсутствие перекрытия тулбара обоими меню, поиск/отмену с восстановлением выделения, состояние Align при смене блока, меню Heading и оформленные локализованные tooltips с сочетаниями клавиш, viewport bounds и сохранением выделения.

Снимки Heading и преобразования RU/EN в light/dark получены headless Chrome и визуально просмотрены:

- [Преобразование RU dark](test-results/refactor-capabilities-2026-10-05/screenshots/conversion-ru-dark.png), [RU light](test-results/refactor-capabilities-2026-10-05/screenshots/conversion-ru-light.png), [EN dark](test-results/refactor-capabilities-2026-10-05/screenshots/conversion-en-dark.png), [EN light](test-results/refactor-capabilities-2026-10-05/screenshots/conversion-en-light.png).
- [RU dark](test-results/refactor-capabilities-2026-10-05/screenshots/heading-ru-dark.png), [RU light](test-results/refactor-capabilities-2026-10-05/screenshots/heading-ru-light.png).
- [EN dark](test-results/refactor-capabilities-2026-10-05/screenshots/heading-en-dark.png), [EN light](test-results/refactor-capabilities-2026-10-05/screenshots/heading-en-light.png).

Новых видимых окон/вкладок Chrome не создавалось. Native проверки идут в независимом headless Chrome на localhost; заблокированный IAB target не использовался. Это Windows/Chrome и локальные fixtures: не ручной OS IME/file chooser, не подтверждение внешних upload/providers или Firefox/WebKit/macOS.

Демо: http://127.0.0.1:5173/ru/#demo. Предыдущий проход: [подсказки и возврат выделения](RECTOR_V2_TOOLTIP_AUDIT_2026-10-05.md).
