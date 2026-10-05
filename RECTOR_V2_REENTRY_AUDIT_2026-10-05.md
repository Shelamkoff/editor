# Повторная проверка ядра и паритета Rector v2 — 05.10.2026

Актуальное продолжение: [проверка составных команд и паритета от 05.10.2026](RECTOR_V2_OBSERVER_AUDIT_2026-10-05.md). Таблицы и числа этого отчёта описывают предыдущий срез; матрица повторно проверяется после новых исправлений.

Ветка `refactor/rector-v2-architecture`; база этой итерации — `1fc93ab42ffa95aacb06ba48c1ef9619e9172e4f`. Предыдущий [отчёт с 938 native cases и 421 Node test](RECTOR_V2_FOLLOWUP_2026-10-05.md) описывает прежний срез. Сверка v1 использует локальный `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`, и [матрицы ядра](RECTOR_V2_CORE_PARITY_2026-10-04.md) / [21 плагина](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md). Ошибки жизненного цикла оцениваются по [контрактам C1/C5](RECTOR_V2_REMEDIATION_SPEC.md).

## Исправленные ошибки

| Дефект | Исправленный результат | Воспроизведение / проверка |
|---|---|---|
| После failed mode transition восстановление пересоздавало блок и теряло каретку / межблоковое выделение | Возвращаются исходные anchor/focus, offsets, направление и фокус. Проверены collapsed/forward/backward и backward range через Color widget. | [red](test-results/refactor-reentry-2026-10-05/mode-selection-red.log), [green](test-results/refactor-reentry-2026-10-05/mode-selection-green.log), [inline range](test-results/refactor-reentry-2026-10-05/inline-selection-green.log) |
| Один DataTask мог рекурсивно выполнить второй producer до закрытия первого commit | Выполняющаяся задача резервирует commit; повторный вход возвращает false до producer. Один commit, событие и шаг истории. | [red](test-results/refactor-reentry-2026-10-05/task-reentry-red.log), [green](test-results/refactor-reentry-2026-10-05/task-reentry-green.log) |
| Block/inline producers исполнялись до общей транзакции; nested write сохранялся при отказе внешнего producer, повторные обновления читали старый Store | Producers и validation выполняются в builder одного Engine. Все записи откатываются при ошибке; caught inner validation error также прерывает outer action. Последовательные записи читают draft и отменяются вместе. | [block red](test-results/refactor-reentry-2026-10-05/producer-atomic-red.log), [green](test-results/refactor-reentry-2026-10-05/producer-atomic-green.log), [inline red](test-results/refactor-reentry-2026-10-05/inline-atomic-red.log), [green](test-results/refactor-reentry-2026-10-05/inline-atomic-green.log) |
| Outer partial patch затирал поля, изменённые nested update того же блока | Неуказанные поля берутся из актуального draft после producer. Inline update сохраняет новый author text. Удалённый/преобразованный target не перезаписывается; операция откатывается. | [block red](test-results/refactor-reentry-2026-10-05/partial-update-red.log), [green](test-results/refactor-reentry-2026-10-05/partial-update-green.log), [inline red](test-results/refactor-reentry-2026-10-05/inline-partial-red.log), [green](test-results/refactor-reentry-2026-10-05/inline-partial-green.log) |
| Любой plugin AggregateError считался невосстановимым отказом, даже после успешного возврата controls | Failed authority определяется отдельным внутренним ReadOnlyRecoveryError, а не классом ошибки стороннего плагина. Восстановимые block/inline AggregateError сохраняют editing и Undo. | [red](test-results/refactor-reentry-2026-10-05/control-classification-red.log), [green](test-results/refactor-reentry-2026-10-05/control-classification-green.log) |
| Inline rollback failure сразу блокировал runtime без попытки пересоздать committed widgets | Reconciler выполняет полное восстановление. Только отказ и этого восстановления останавливает mutation; save остаётся committed, AggregateError сохраняет apply/rollback/remount причины. | [red](test-results/refactor-reentry-2026-10-05/control-classification-red.log), [green](test-results/refactor-reentry-2026-10-05/control-classification-green.log) |
| setReadOnly с прежним значением публиковал лишние события и закрывал UI; nonboolean мог разблокировать авторинг | Восстановлен v1 контракт из master:core/EditorFacade.js:183: boolean-only, same-value no-op без mode/history observations. | [red](test-results/refactor-reentry-2026-10-05/control-classification-red.log), [green](test-results/refactor-reentry-2026-10-05/control-classification-green.log) |

## Архитектура

Новая модель/история/legacy adapter не добавлены. Store, History и TransactionEngine остаются едиными владельцами canonical commit. Producers перемещены в существующий transaction builder; проверки phase до producer сохранены. Scope имеет лишь transient committing flag для one-shot DataTask. ReadOnlyRecoveryError — внутренний сигнал projector → runtime; он не добавлен к публичным export paths. Нормальная смена режима остаётся in-place; remount используется для восстановления после отказа.

Реальные Paragraph, Heading и Color проверены через public createEditor, editor.blocks, scoped context и native input. runtime-contracts.html содержит 23 cases; Node seam использует настоящий Store/Engine/History и controlled ports для faults. Проверены устаревшая task после conversion → Undo, свежая task на latest data, one-shot commit, nested history/validation и остановка producer при irrecoverable recovery. Требование сохранять все авторские поля при conversion и исключение размера ядра из blocking criteria сохранены.

## Окончательные проверки

JS/CSS и исполняемые fixtures не менялись во время окончательных прогонов. Изменения отчётов после них не меняют runtime. Проверки выполнялись локально в Windows/Chrome; archive consumer относится к tarball текущего checkout.

| Gate | Итог | Лог |
|---|---|---|
| Node | 428 PASS, 0 FAIL/skip | [node](test-results/refactor-reentry-2026-10-05/node-final.log) |
| TypeScript | Оба проекта PASS | [typecheck](test-results/refactor-reentry-2026-10-05/typecheck-final.log) |
| Browser CLI | 24 страницы PASS | [browser](test-results/refactor-reentry-2026-10-05/browser-final.log) |
| Native physical runner | 942 PASS, 0 FAIL/skip/driver errors; physical Enter/toolbox/history PASS | [native](test-results/refactor-reentry-2026-10-05/native-final.log) |
| Heap/lifecycle | 21 sentinel, 0 retained; usedHeap 12.44 MiB | [heap](test-results/refactor-reentry-2026-10-05/heap-final.log) |
| Build | 263 declarations, 0 source diagnostics | [build](test-results/refactor-reentry-2026-10-05/build-final.log) |
| Types | 6 PASS; Bundler / NodeNext | [types](test-results/refactor-reentry-2026-10-05/types-final.log) |
| Package | Native import, Bundler/NodeNext, Vite и CSS assets PASS | [package](test-results/refactor-reentry-2026-10-05/package-final.log) |
| Docs source/contracts | 47 EN/RU pairs, 53 examples, 44 JSON, 62 links PASS | [contracts](test-results/refactor-reentry-2026-10-05/docs-contract-final.log) |
| Built docs/browser | 123 pages, 0 broken links/missing assets; demo/search/Mention PASS | [docs](test-results/refactor-reentry-2026-10-05/docs-final.log) |

Ожидаемые FAIL в harness-contract.html проверяют сам harness; его want/outcomes совпали, runner завершился с exit 0.

Native coverage включает все 21 plugins, 34 authoring fields, 29 rich fields, local/cross selection, clipboard и conversion. Design matrix — 84 combinations / 336 states: 21 plugins × light/dark × 640/288 px × filled/empty/read-only/empty-read-only. Это CSS/geometry/state checks, не pixel diff двух приложений.

Первый complete run дал 941 PASS до последних control fixes. Следующий final run [прервался по CDP Runtime.evaluate timeout](test-results/refactor-reentry-2026-10-05/native-interrupted.log) без итоговой матрицы; он не считается успешным. Повторный полный прогон на неизменённом runtime завершился успешно: 942 cases. Разбиение: text 42, tools 24, clipboard 7, IME 9, conversion 7, menus 8, structural 21, cross selection 32, core 53, plugin parity 139, controls 141, cross ranges 116, local ranges 76, plugin clipboard 48, field clipboard 68, media 67, design 84.

## Ручная проверка и ограничения

В существующей IAB вкладке русского демо выполнены Home/Shift+Down от Heading через Paragraph с Mention/Color в List, Backspace, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Z. Сравнение textContent/innerHTML всех полей подтвердило точное Undo и повтор удаления; исходный документ восстановлен. Эта ручная цепочка выполнена до последних control-only исправлений. Их реальные DOM/native отказы проверены автоматически на финальном JS. Новые видимые окна Chrome не открывались.

После завершения docs build IAB сессия оказалась на data: странице ошибки соединения; браузерная URL policy запретила её чтение. Новый снимок не получен, ограничения не обходились. Локальный docs:dev сервер восстановлен на http://127.0.0.1:5173/ru/#demo и проверен отдельно по HTTP. Пользователь может перезагрузить вкладку.

В пройденной матрице после исправлений известных материальных расхождений не осталось. Это не доказательство отсутствия любых багов. Физический OS IME, ручной OS file chooser, доступность удалённых providers и Firefox/WebKit этим прогоном не подтверждаются. Native clipboard проверяется Chrome runner; IAB используется для ручной UI/history проверки.

Итоги и counts: [verification-summary.json](test-results/refactor-reentry-2026-10-05/verification-summary.json). SHA-256 изменённых локальных файлов: [source-manifest.json](test-results/refactor-reentry-2026-10-05/source-manifest.json); hashes относятся к working-copy bytes до нормализации переводов строк Git.
