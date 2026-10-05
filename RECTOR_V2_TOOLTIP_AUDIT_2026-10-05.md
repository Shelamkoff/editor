# Rector v2 — подсказки и возврат выделения, 05.10.2026

Актуальный проход: [повторная проверка функций, меню и владения UI-контекстами от 05.10.2026](RECTOR_V2_MOVE_CONVERSION_AUDIT_2026-10-05.md). Числа ниже относятся к предыдущему срезу.

Восстановлены подсказки панели форматирования по образцу v1: собственное оформление, задержка 500 мс и отдельная плашка сочетания клавиш. Стандартные инструменты в демо используют выбранный словарь; проверены RU/EN и светлая/тёмная темы. Дополнительно исправлена потеря выделения после отмены панели ссылки.

Ветка: `refactor/rector-v2-architecture`. Исходный HEAD: `57da9c701257a8f93af69c3185c101c50d8671a1`. Сравнение с локальным v1 `master` / `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`, его Tooltip/ActionsPanel, и скриншотами пользователя. Старые менеджеры или UI-адаптеры в v2 не подключены.

## Исправления

- LiveDemo передавал локаль редактору, но создавал inline-инструменты без переводчика. Теперь используется тот же словарь. Проверены названия всех 12 инструментов, панели Link/Align/Script, «Назад», Apply/Unlink и динамическая подпись активной ссылки.
- В v2 использовался браузерный `title`; показ подсказок в action-контексте был заглушкой. Новый компонент подсказок принадлежит панели редактора и использует её ownerDocument/window, существующие CSS-переменные темы и доступные названия кнопок. Текст не интерпретируется как HTML. Подсказки кнопок добавления/настройки блока тоже используют локализованные названия.
- Клавиши отображаются рядом с названием, например «Зачёркнутый» и `Ctrl+Shift+S`. Нативный `title` основной панели убран, чтобы не появлялась вторая подсказка. Подсказка не перехватывает указатель; ширина и координаты ограничены viewport. Таймеры, связи aria-describedby и слушатели очищаются при закрытии/readOnly/destroy.
- При «Назад» или Escape фокус оставался в удалённом URL-поле, а сохранённое выделение не восстанавливалось. Action-контекст теперь восстанавливает логический bookmark; после изменения документного текста bookmark обновляется. Отозванный контекст не восстанавливает устаревшее выделение. Проверены single/cross-block, обратное межблоковое выделение, применение следующего инструмента и один шаг Undo.
- Исправлен тип минимального переводчика preset. В EN/RU документации добавлен пример привязки словаря и описаны optional backLabel/shortcut.
- В дополнительном QA-сценарии глобальный селектор URL-формы попадал в скрытую предзагруженную форму Image вместо открытой формы Carousel. Проверка теперь выбирает открытую форму нужного плагина; после этого сценарий прошёл полностью.

## TDD и реальное поведение

Три регрессии подтверждены до исправления и после него: [перевод — red](test-results/refactor-tooltips-2026-10-05/demo-locale-red.log), [оформленная подсказка — red](test-results/refactor-tooltips-2026-10-05/tooltip-red.log), [отмена панели — red](test-results/refactor-tooltips-2026-10-05/panel-cancel-red.log). [Проверка возврата выделения — green](test-results/refactor-tooltips-2026-10-05/panel-cancel-green.log). Ожидаемые red не относятся к итоговому прогону.

Native hover/click/keys выполняются через существующий headless runner на localhost. В новых проверках наведение на каждый инструмент сохраняет выделение и историю; проверены вложенные панели, обновление active label, задержка, readOnly, pending destroy и независимость двух редакторов. Полная матрица повторно проверяет поведение всех плагинов после изменения ядра.

## Итоговые проверки

JS/CSS и исполняемые fixtures не менялись во время окончательных общих прогонов. Все перечисленные gates завершились успешно.

| Проверка | Результат | Доказательство |
|---|---|---|
| Node | 431 PASS, 0 FAIL/skip | [node](test-results/refactor-tooltips-2026-10-05/node.log) |
| TypeScript | Оба проекта PASS | [typecheck](test-results/refactor-tooltips-2026-10-05/typecheck.log) |
| Inline UI/native | 33 PASS, в том числе 9 новых регрессий | [tools](test-results/refactor-tooltips-2026-10-05/native-tools.log) |
| Все native gestures | 951 PASS, 0 FAIL/skip, physical Enter/toolbox/history PASS | [native](test-results/refactor-tooltips-2026-10-05/native-full.log) |
| Browser CLI | Все 24 страницы PASS | [browser](test-results/refactor-tooltips-2026-10-05/browser-full.log) |
| Heap/lifecycle | 21 sentinel, 0 retained; 12.48 MiB usedHeap | [heap](test-results/refactor-tooltips-2026-10-05/heap.log) |
| Сборка | 264 декларации, 0 diagnostics | [build](test-results/refactor-tooltips-2026-10-05/build.log) |
| Consumer types | 6 PASS | [types](test-results/refactor-tooltips-2026-10-05/test-types.log) |
| Локальный пакет | Tarball/import/Vite/Bundler/NodeNext и 22 CSS PASS | [package](test-results/refactor-tooltips-2026-10-05/test-package.log) |
| Исходники/локали/документация | 47 EN/RU pairs, 94 readmes, 53 examples, 44 JSON, 62 links PASS | [contracts](test-results/refactor-tooltips-2026-10-05/test-docs.log) |
| Production docs/demo | 123 pages, 0 broken links/missing assets; RU/EN tooltips × обе темы PASS | [production](test-results/refactor-tooltips-2026-10-05/docs-check.log) |
| Dev demo + скриншоты | RU/EN/light/dark, сочетания, поиск, Mention, Image/Carousel QA PASS | [demo](test-results/refactor-tooltips-2026-10-05/demo-visual.log) |

Design matrix: все 21 плагин × 2 темы × 640/288 px × filled/empty/read-only/empty-read-only: 84 комбинации, 336 состояний. Это CSS/геометрия/состояния, не автоматический pixel diff v1/v2. Ожидаемые FAIL внутри harness-contract проверяют сам harness; общий gate PASS.

## Скриншоты подсказок

Скриншоты получены настоящим наведением мыши в независимом headless Chrome и визуально просмотрены:

- [Русский / тёмная тема](test-results/refactor-tooltips-2026-10-05/screenshots/tooltip-ru-dark.png)
- [Русский / светлая тема](test-results/refactor-tooltips-2026-10-05/screenshots/tooltip-ru-light.png)
- [English / dark](test-results/refactor-tooltips-2026-10-05/screenshots/tooltip-en-dark.png)
- [English / light](test-results/refactor-tooltips-2026-10-05/screenshots/tooltip-en-light.png)

[Машинная сводка](test-results/refactor-tooltips-2026-10-05/verification-summary.json), [SHA-256 исходников и доказательств](test-results/refactor-tooltips-2026-10-05/source-manifest.json). Hashes относятся к локальным bytes до нормализации LF/CRLF Git.

## Границы проверки

Windows/Chrome, локальные fixtures, dev и production demo. Новых видимых окон Chrome и вкладок не создано; заблокированная IAB-страница не использовалась. Это не ручная проверка OS IME/file chooser или подтверждение Firefox/WebKit/macOS. Отдельная runtime-проверка системного отображения клавиш macOS не выполнялась. Внешние upload/providers этим прогоном не подтверждаются. Известные расхождения в описанной матрице после исправлений не остались; проверка не доказывает отсутствие любых будущих ошибок.

Предыдущая общая проверка: [ядро и наблюдатели](RECTOR_V2_OBSERVER_AUDIT_2026-10-05.md). Демо: http://127.0.0.1:5173/ru/#demo.
