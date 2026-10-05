# Повторная проверка составных команд и паритета Rector v2 — 05.10.2026

Ветка `refactor/rector-v2-architecture`; база этой итерации — `1f0860ddeb5291fcbe1dc921825b0c208b6b8fe2`. Предыдущий [отчёт](RECTOR_V2_REENTRY_AUDIT_2026-10-05.md) относится к срезу до изменений ниже. Контракты проверяются по [спецификации C1/C5/C6](RECTOR_V2_REMEDIATION_SPEC.md); эталон пользовательского поведения — v1 `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`, и существующие [матрицы ядра](RECTOR_V2_CORE_PARITY_2026-10-04.md) / [21 плагина](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md). Согласованное сохранение всех авторских полей при whole conversion остаётся в силе; размер ядра не является критерием отказа.

## Исправленные ошибки

| Дефект | Проверенный результат | TDD |
|---|---|---|
| Защита read-only заканчивалась до UI и mode/history observers: вложенный host producer мог исполниться, вложенный setReadOnly менял режим во время публикации | Защита действует до завершения UI и обеих observations. Второй listener видит тот же committed mode; producer и beginTask отклоняются заранее. Очередь после возврата setReadOnly разрешена. | [red](test-results/refactor-observers-2026-10-05/readonly-observers-red.log), [green](test-results/refactor-observers-2026-10-05/readonly-after-ime-green.log) |
| Вложенное преобразование читало старый Store и теряло новые text/tunes | Convert читает текущий draft: Authored Beta и center сохраняются при H3; DOM, Undo и Redo проверены через настоящие Paragraph/Heading. | [red](test-results/refactor-observers-2026-10-05/conversion-draft-red.log), [green](test-results/refactor-observers-2026-10-05/conversion-draft-green.log) |
| Вложенная вставка пыталась выбрать ещё не committed ID, вызывая Unknown block id; default append index вычислялся по старому Store | Новый ID не выбирается до commit; две вставки сохраняют порядок First → Second. Queries/interaction остаются committed; один Undo отменяет составную запись. Обычная вставка по-прежнему выбирает новый блок. | [red](test-results/refactor-observers-2026-10-05/append-order-red.log), [green](test-results/refactor-observers-2026-10-05/append-order-green.log) |
| Удаление не находило блок, вставленный ранее в том же builder; последовательное удаление использовало старый порядок/счётчик | Remove читает draft. Временный блок можно удалить в том же action. При удалении последнего authored блока остаётся один default; Undo возвращает исходные блоки. | [red](test-results/refactor-observers-2026-10-05/remove-draft-red.log), [green](test-results/refactor-observers-2026-10-05/remove-draft-green.log), [runtime](test-results/refactor-observers-2026-10-05/runtime-final.log) |
| Ошибка подготовки вложенного render/clear происходила вне Engine; catch позволял сохранить внешнюю запись | Ingest render и подготовка default clear входят в тот же builder. Перехваченная внутренняя ошибка отменяет всё action, сохраняя модель, DOM и историю. | [render red](test-results/refactor-observers-2026-10-05/render-atomic-red.log), [green](test-results/refactor-observers-2026-10-05/render-atomic-green.log), [clear red](test-results/refactor-observers-2026-10-05/clear-atomic-red.log), [green](test-results/refactor-observers-2026-10-05/clear-atomic-green.log) |
| Promise принимался за пустой block patch и позволял сохранить nested write | Асинхронный patch отклоняется до commit с отменой nested writes и без истории. | [red](test-results/refactor-observers-2026-10-05/async-patch-red.log), [green](test-results/refactor-observers-2026-10-05/async-patch-green.log) |

Полный первый прогон обнаружил регрессию внесённого guard: NativeInputController не мог отменить preedit изнутри read-only перехода. [Неуспешный native log](test-results/refactor-observers-2026-10-05/native-ime-regression-red.log) сохранён; этот прогон не считается успешным. Исправление передаёт внутреннему composition cleanup только восстановление committed projection; никакой persisted mutation не разрешается. Восстановление само защищено от повторного входа. [Все 9 native IME cases](test-results/refactor-observers-2026-10-05/native-ime-green.log) и [проверка public observers/scoped tasks](test-results/refactor-observers-2026-10-05/readonly-after-ime-green.log) прошли до повторного полного прогона.

Первый docs gate также отклонил технические термины в русском обычном тексте. Они оформлены как ссылки на API в коде; тест локализации сохранён [в логе](test-results/refactor-observers-2026-10-05/docs-before-ime-fix.log). Его отказ не скрывается за итогом повторного прогона.

## Архитектура и метод

Используются существующие Store/History/TransactionEngine. Второй model, history или legacy runtime не добавлены. Подготовка host commands входит в имеющийся builder; события режима завершаются под существующим transition guard. Внутренний recovery callback не экспортируется через EditorHandle/plugin context. Scoped plugin mutations по-прежнему отклоняются до producer в guarded phases.

Шесть новых cases проверяют публичный createEditor/blocks API с настоящими Paragraph/Heading и DOM. runtime-contracts.html теперь содержит 29 cases. Три Node cases используют реальный runtime/Store/Engine/History и controlled projector/default ports для отказа подготовки, последнего default блока и IME recovery authority. Регрессии проходят red → green по одному поведению. Новые persisted команды остаются одним шагом Undo; save и queries читают committed данные.

## Окончательные проверки

JS/CSS и исполняемые fixtures после старта окончательного прогона не менялись. Отчёт и указатели обновлены после него; они не меняют runtime. Все команды завершились exit 0.

| Gate | Итог | Лог |
|---|---|---|
| Node | 431 PASS, 0 FAIL/skip | [node](test-results/refactor-observers-2026-10-05/node-final.log) |
| TypeScript | Оба проекта PASS | [types](test-results/refactor-observers-2026-10-05/typecheck-final.log) |
| Browser CLI | 24 pages PASS, runtime contracts 29 PASS | [browser](test-results/refactor-observers-2026-10-05/browser-final.log) |
| Native gestures | 942 PASS, 0 FAIL/skip/driver errors; physical Enter/toolbox/history PASS | [native](test-results/refactor-observers-2026-10-05/native-final.log) |
| Heap/lifecycle | 21 sentinels, 0 retained; usedHeap 12.44 MiB | [heap](test-results/refactor-observers-2026-10-05/heap-final.log) |
| Build | 263 declarations, 0 source diagnostics | [build](test-results/refactor-observers-2026-10-05/build-final.log) |
| Types consumer | 6 PASS, Bundler/NodeNext | [types](test-results/refactor-observers-2026-10-05/types-final.log) |
| Package | Checkout tarball import, Vite, consumer types, 22 CSS assets PASS | [package](test-results/refactor-observers-2026-10-05/package-final.log) |
| Docs contracts/source/locales | 47 EN/RU pairs, 94 readmes, 53 examples, 44 JSON, 62 links PASS | [contracts](test-results/refactor-observers-2026-10-05/docs-contract-final.log) |
| Production docs/browser | 123 pages; 0 broken links/missing assets; demo/search/Mention PASS | [docs](test-results/refactor-observers-2026-10-05/docs-final.log) |

Native counts: text 42, tools 24, clipboard 7, IME 9, conversion 7, menus 8, structural 21, cross selection 32, core 53, plugin parity 139, controls 141, cross ranges 116, local ranges 76, plugin clipboard 48, field clipboard 68, media 67, design 84. Все 21 plugins, 34 authoring fields и 29 rich-text fields повторно проверены. Design — 84 combinations / 336 states: 21 plugins × light/dark × 640/288 px × filled/empty/read-only/empty-read-only. Ожидаемые FAIL в harness-contract.html проверяют сам harness и не являются отказом gate.

В пройденной матрице после исправлений известных материальных расхождений не осталось. Это ограниченное утверждение о проверенных сценариях, а не доказательство отсутствия любых возможных ошибок.

[Сводка](test-results/refactor-observers-2026-10-05/verification-summary.json) и [SHA-256 исходников/доказательств](test-results/refactor-observers-2026-10-05/source-manifest.json). Hashes относятся к локальным working-copy bytes до нормализации LF/CRLF Git.

## Ограничения

Проверка выполняется локально на Windows/Chrome. Native suites проверяют настоящие keyboard/mouse/clipboard/composition события; это не ручной физический OS IME. Design matrix проверяет CSS, геометрию и состояния всех 21 plugins, а не pixel diff двух приложений. Ручной OS file chooser, доступность внешних providers и Firefox/WebKit этим прогоном не подтверждаются.

В существующей IAB вкладке inventory по-прежнему показывает data: страницу ERR_CONNECTION_REFUSED; предыдущая browser URL policy запрещала доступ к ней. Повторного обхода/чтения этого target не выполнялось, новые видимые окна/вкладки не создавались. Новый ручной снимок демо в этом проходе не получен. Сам docs:dev сервер отдельно проверяется по HTTP на http://127.0.0.1:5173/ru/#demo.
