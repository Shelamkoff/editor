# Продолжение проверки Rector v2 — 05.10.2026

Ветка `refactor/rector-v2-architecture`. База — опубликованный `cf97ac6f19496cdd30cce8f998d4ee7297f3b2a1`. Результаты относятся к исправлениям этой итерации поверх него; SHA-256 изменённых локальных файлов — в [source-manifest.json](test-results/refactor-followup-2026-10-05/source-manifest.json). Прогон выполнен локально в Windows/Chrome, не в CI исходного коммита.

Предыдущая итерация: [934 native cases и 419 Node tests](RECTOR_V2_RECHECK_2026-10-05.md). База v1 остаётся `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`; [матрица ядра](RECTOR_V2_CORE_PARITY_2026-10-04.md) и [матрица 21 плагина](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md) повторно пройдены. Error/lifecycle outcomes оцениваются также по [контракту v2](RECTOR_V2_REMEDIATION_SPEC.md), а не по отсутствию подобных guards в v1.

## Найденные и исправленные ошибки

Продолжение аудита выявило семь групп ошибок на границах команд, смены режима и восстановления выделения. Red-логи ниже воспроизводят дефекты до соответствующего исправления. Green и окончательные gates подтверждают исправленный результат; утверждения о selection offsets, направлении, фокусе и истории не ослаблялись.

| Ошибка | Исправление | Red / green в `test-results/refactor-followup-2026-10-05/` |
|---|---|---|
| Host producer выполнялся из prepare/apply/finalize/publish, хотя команда затем отвергалась | Guard проверяет фазу до вызова producer. Допустимые вложенные внутренние команды building по-прежнему используют один transaction engine. | [host-phase-red](test-results/refactor-followup-2026-10-05/host-phase-red.log), [green](test-results/refactor-followup-2026-10-05/host-phase-green.log) |
| Plugin control hook мог сохранить документ или рекурсивно сменить read-only во время перехода | Control transition защищён до plugin callbacks и завершается только после успешного применения. Вложенные commands/mode transitions не выполняются; последующая обычная запись работает. | [control-reentry-red](test-results/refactor-followup-2026-10-05/control-reentry-red.log), [green](test-results/refactor-followup-2026-10-05/control-reentry-green.log) |
| Плагин изменял controls, выбрасывал ошибку и оставался заблокированным при `readOnly=false` | В rollback включается и экземпляр, частично изменённый до throw. Реальный Paragraph снова редактируем; повторная смена режима и последующая запись работают. | [control-rollback-red](test-results/refactor-followup-2026-10-05/control-rollback-red.log), [green](test-results/refactor-followup-2026-10-05/control-rollback-green.log) |
| Такой же частичный отказ у inline widget оставлял его недоступным с клавиатуры | Inline rollback также включает бросивший экземпляр. У обоих реальных Color widgets восстанавливается `tabIndex=0`, модель/history неизменны. | [inline-control-rollback-red](test-results/refactor-followup-2026-10-05/inline-control-rollback-red.log), [green](test-results/refactor-followup-2026-10-05/inline-control-rollback-green.log) |
| DataTask можно было начать внутри protected edit/control transition | Block и inline scopes читают действительную фазу runtime, включая эти операции. Begin/commit проверяют guard до авторского callback. Реальные context beginTask в обоих запрещённых состояниях не выделяют задачу. | [task-phase-red](test-results/refactor-followup-2026-10-05/task-phase-red.log), [green](test-results/refactor-followup-2026-10-05/task-phase-green.log) |
| После ошибки protected edit данные восстанавливались, но каретка/межблоковое выделение исчезали | До operation снимается logical bookmark; после восстановления committed projection возвращаются его anchor/focus/offsets и фокус. Recovery также остаётся под guard. | [projection-selection-red](test-results/refactor-followup-2026-10-05/projection-selection-red.log), [green](test-results/refactor-followup-2026-10-05/projection-selection-green.log) |
| Redo успешного protected edit возвращал каретку в начало | Конечное выделение снимается до повторной проекции, применяется к подготовленным hosts и записывается в историю. Undo восстанавливает исходный backward range, Redo — конечную каретку 2. | [projection-history-red](test-results/refactor-followup-2026-10-05/projection-history-red.log), [green](test-results/refactor-followup-2026-10-05/projection-history-green.log) |

Unit tests используют настоящий Store/History/TransactionEngine и controlled projection port для fault injection. `runtime-contracts.html` дополнительно проверяет публичный `createEditor`, реальные Paragraph/Color instances, control hooks и committed observers (11 cases). Четыре новых native cases используют доверенные click/drag/Undo/Redo; исключение умышленно вводится через настоящий plugin DOM callback. Это проверка отказа расширения, не подмена browser editing engine.

## Архитектура и паритет

Committed модель, transaction/history authority и logical selection port остаются общими. Новый guard не создаёт вторую модель или отдельную историю. Plugin scopes видят фазу protected edit/control transition; отменённый callback не получает полномочий через устаревшее представление engine idle. Ошибка control transition восстанавливает все attempted controls, а не только завершившиеся handlers.

Protected seam хранит before/after bookmarks вокруг DOM operation. Explicit planned bookmarks контроллеров сохраняются; default plugin callback больше не теряет after-caret при reprojection. После failed operation возвращаются committed данные и before-selection; после успешного commit история хранит действительный пользовательский before/after результат.

Требование сохранять все авторские поля при whole conversion и исключение размера ядра из blocking criteria остаются в силе. Старое ядро/adapter не подключались. Все прежние native suites повторно выполнены, включая 21 плагин, 34 authoring fields, 29 rich fields, local/cross clipboard, conversion, controls, media и дизайн.

## Итоговые gates

Production JS/CSS и fixtures не менялись во время окончательных прогонов. Два TS проекта прошли. Проверки публикации относятся к архиву текущего checkout.

| Gate | Итог | Лог |
|---|---|---|
| `node --test` | 421 PASS, 0 FAIL/skip | [node-final](test-results/refactor-followup-2026-10-05/node-final.log) |
| `npm run typecheck` | PASS | [typecheck-final](test-results/refactor-followup-2026-10-05/typecheck-final.log) |
| Browser CLI | 24 страницы PASS | [browser-final](test-results/refactor-followup-2026-10-05/browser-final.log) |
| Native physical runner | 938 PASS, 0 FAIL/skip/driver errors; Enter/toolbox/history scenarios PASS | [native-final](test-results/refactor-followup-2026-10-05/native-final.log) |
| Heap/lifecycle | 21 sentinel, 0 retained; used heap 12.43 MiB | [heap-final](test-results/refactor-followup-2026-10-05/heap-final.log) |
| Build | 262 declarations, 0 source diagnostics | [build-final](test-results/refactor-followup-2026-10-05/build-final.log) |
| Declarations | 6 PASS, Bundler/NodeNext | [types-final](test-results/refactor-followup-2026-10-05/types-final.log) |
| Package consumer/assets | Native import, Bundler/NodeNext, Vite и CSS assets PASS | [package-final](test-results/refactor-followup-2026-10-05/package-final.log) |
| Docs contracts | Source/locales/contracts PASS; 47 EN/RU pairs, 53 examples, 44 JSON, 62 links | [docs-contract-final](test-results/refactor-followup-2026-10-05/docs-contract-final.log) |
| Built docs/browser smoke | 123 pages, 0 broken links/missing assets; editor/renderer/search/Mention PASS | [docs-final](test-results/refactor-followup-2026-10-05/docs-final.log) |

Native core suite расширена 45 → 49; остальные counts сохранены: text 42, tools 24, clipboard 7, IME 9, conversion 7, menus 8, structural 21, cross selection 32, plugin parity 139, controls 141, cross ranges 116, local ranges 76, plugin clipboard 48, field clipboard 68, media 67, design 84. Design включает 336 состояний всех 21 плагинов × light/dark × 640/288 px × filled/empty/read-only/empty-read-only; это CSS/geometry/visible-state checks, не pixel diff двух приложений.

Ожидаемые FAIL witnesses в harness-contract проверяют корректность harness, runner exit 0. Новый русский абзац сначала не прошёл проверку английских терминов (`docs-locale-red.log`); терминология исправлена, окончательный docs gate прошёл. Информационное предупреждение VitePress о размере chunks не блокирует build.

## Ручная проверка

В существующей вкладке [русского демо](http://127.0.0.1:5173/ru/#demo) проверен Preview → Editor, затем Shift+Down через Heading/Paragraph с Mention/Color/List, клик Italic, Ctrl+Z/Ctrl+Shift+Z/Ctrl+Z. Сравнение до/после подтверждает точное восстановление textContent и innerHTML всех author fields. Redo повторяет marks на тех же полях, фокус остаётся в Heading; исходный документ оставлен восстановленным.

Снимок [межблокового выделения](test-results/refactor-followup-2026-10-05/formatting-undo.jpg) сделан после возврата исходного документа. Новых видимых окон/вкладок Chrome не создавалось. Dev-документация перезагрузилась при синхронизации README; ручная цепочка форматирования повторена после завершения сборок на стабильном состоянии.

Перечисленная матрица пройдена без известных материальных расхождений, но это не доказательство отсутствия любых багов. Физический IME конкретной ОС, ручной OS file chooser, доступность удалённых providers и Firefox/WebKit этим прогоном не подтверждаются. Native clipboard проверен в Chrome; IAB ручная сессия служит проверкой UI/selection/history. Heap gate доказывает очистку проверенного сценария.
