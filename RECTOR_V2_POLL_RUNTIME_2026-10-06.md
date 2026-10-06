# Rector v2 — Poll, каретка и повторная проверка паритета, 06.10.2026

Продолжение: [Проверка всей библиотеки от 06.10.2026](RECTOR_V2_LIBRARY_AUDIT_2026-10-06.md). Числа ниже относятся к предыдущему срезу.

Продолжение [предыдущего прохода](RECTOR_V2_CONFIG_SNAPSHOT_2026-10-06.md) на базе `fa113bf8bd0fc49579e9be59ac6f504994fe4024`, ветка `refactor/rector-v2-architecture`.

## Найденные ошибки и исправления

1. При настроенном удалённом сервисе и пустом `pollId` голосование ошибочно меняло авторские `initialResults` как локальная операция. Теперь отображается локализованная ошибка; внешний сервис не вызывается, данные и история не меняются.
2. Метод `subscribe` читался дважды. Определение также сохраняло изменяемые методы исходного сервиса, включая окно ожидания динамического импорта. `load`, `vote` и `subscribe` теперь захватываются один раз с исходным `this`. Методы классов и их приватные поля работают; состояние приложения остаётся изменяемым, поздняя замена метода не меняет определение.
3. Ошибки загрузки, голосования и подписки попадали в observer, но не отображались в редакторе. Возвращён существующий локализованный статус ошибки с `role="alert"`. Следующее принятое обновление результатов снимает ошибку; авторской транзакции нет.
4. Live-результаты пересоздавали question/options, отсоединяя зарегистрированные editing hosts и теряя фокус, каретку или выделение. Обновление голосования теперь сохраняет авторские поля. Прямые, обратные и межблочные диапазоны остаются пригодными для следующего ввода и преобразования; Undo/Redo возвращают данные и диапазон.
5. Прямая фабрика Poll renderer обходила уже существовавший захват конфигурации фасада/async loader. При прямой регистрации наблюдались поздние методы сервиса и повторное чтение getter. Фабрика использует существующую границу `snapshotPollRendererConfig`; четыре пути создания проверены настоящими кликами голосования.

## Архитектура и сравнение с v1

Исправления находятся в Poll и renderer, по контрактам C5/C6/P4 [спецификации](RECTOR_V2_REMEDIATION_SPEC.md). Ядро selection/history не изменено. Сохранены текущий JSON/API, одна каноническая история и независимость renderer от editing plugins. Не добавлены второй runtime, отдельный движок выделения или проверки имён плагинов в ядре. Локальное голосование остаётся одним отменяемым авторским изменением; удалённые результаты и UI-ошибки не меняют JSON/history.

Проверена настоящая v1, revision `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`: [3 native cases](test-results/refactor-poll-runtime-2026-10-06/v1-poll.log) подтверждают отказ голосовать без pollId, видимую ошибку загрузки и сохранение текстового диапазона при live-обновлении. Все 240 старых JS/CSS сверены с Git: [snapshot](test-results/refactor-poll-runtime-2026-10-06/v1-source-snapshot.json). Однократный захват методов — контракт владения C5 новой архитектуры, а не обещание сохранения изменяемой конфигурации v1. Старые исходники не подключаются к продукту.

## TDD и реальное поведение

Использован [TDD skill](.agents/skills/tdd/SKILL.md), цикл Red → Green. Все шесть продуктовых ошибок воспроизведены до исправления; ссылки Red/Green и команды находятся в [README доказательств](test-results/refactor-poll-runtime-2026-10-06/README.md). [Новая fixture](test-results/refactor-poll-runtime-2026-10-06/../../tests/browser/native-poll-runtime.js) содержит 26 PASS: 22 editor и 4 renderer cases. В общем прогоне присутствуют все прежние 29 native groups и новая группа Poll.

Реальные действия: ввод и Ctrl+Z/Redo, прямое/обратное выделение вопроса и варианта, drag через Poll/Paragraph, преобразование после live-обновления, голосование. Дополнительно проверены RU/EN ошибки, их устранение обновлением, throws/rejected observer, методы классов с приватным состоянием, два редактора, замена документа и поздние callbacks после отмены/уничтожения.

Две проблемы тестовой инфраструктуры записаны отдельно: первоначальное ожидание очистки Undo при public render исправлено на одну отменяемую транзакцию; DOM-заглушка lifecycle дополнена getAttribute/remove без ослабления утверждений. [Изначальный Node лог](test-results/refactor-poll-runtime-2026-10-06/node-before-dom-fixture.log) и [7 lifecycle PASS](test-results/refactor-poll-runtime-2026-10-06/lifecycle-fixture-green.log). Первый package gate остановился на временной Windows EBUSY-блокировке файла jszip; [повторный package gate](test-results/refactor-poll-runtime-2026-10-06/package.log) прошёл.

## Окончательные проверки

| Область | Результат | Доказательство |
| --- | --- | --- |
| Native поведение ядра, 21 плагина и 12 inline tools | 1689 PASS, 30 groups, 0 FAIL | [native-all.log](test-results/refactor-poll-runtime-2026-10-06/native-all.log) |
| Node / типы | 536 PASS; оба TS-проекта PASS; 6 consumer cases PASS | [node.log](test-results/refactor-poll-runtime-2026-10-06/node.log), [typecheck.log](test-results/refactor-poll-runtime-2026-10-06/typecheck.log), [consumer-types.log](test-results/refactor-poll-runtime-2026-10-06/consumer-types.log) |
| Браузерные контракты | 25 страниц PASS | [browser.log](test-results/refactor-poll-runtime-2026-10-06/browser.log) |
| Package | 268 declarations, 0 diagnostics; import/Vite/Bundler/NodeNext PASS, 22 CSS | [package.log](test-results/refactor-poll-runtime-2026-10-06/package.log) |
| Документация / архитектура / локали | 47 RU/EN pairs, 94 README; source/locale/contract audits PASS | [docs.log](test-results/refactor-poll-runtime-2026-10-06/docs.log) |
| Demo / дизайн | 123 production pages, 0 broken links; RU/EN light/dark, 0 missing assets; 29 PNG | [docs-check.log](test-results/refactor-poll-runtime-2026-10-06/docs-check.log), [demo.log](test-results/refactor-poll-runtime-2026-10-06/demo.log) |
| Жизненный цикл | 21 sentinels, 0 retained, heap 12.62 MiB | [heap.log](test-results/refactor-poll-runtime-2026-10-06/heap.log) |
| Bundle gzip | Paragraph 4.1/40; default 13.7/64; full 88.6/96 KiB PASS; core 86.1 KiB информационно по решению владельца | [bundle.log](test-results/refactor-poll-runtime-2026-10-06/bundle.log) |

Свежая demo QA повторила tooltip/shortcut на выбранном языке, меню вне тулбара, геометрию кнопок после Move, fragment conversion, один Image и один Code при cross conversion с сохранением выбранного текста. Просмотрены [русский tooltip](test-results/refactor-poll-runtime-2026-10-06/demo/tooltip-ru-light.png) и [кнопки перемещённого блока](test-results/refactor-poll-runtime-2026-10-06/demo/moved-buttons-ru.png).

595 проверяемых исходников совпадают с [итоговым snapshot](test-results/refactor-poll-runtime-2026-10-06/source-snapshot.json). Runtime/документация/native fixtures были зафиксированы до browser gates и не менялись; после первого Node-прогона изменена только DOM-заглушка Node lifecycle, что проверено отдельно. [Summary](test-results/refactor-poll-runtime-2026-10-06/verification-summary.json) вычислен из raw logs, всех 11 exit outcomes и хешей. [Manifest](test-results/refactor-poll-runtime-2026-10-06/source-manifest.json) связывает изменённые файлы, отчёт и доказательства по локальным байтам до нормализации Git.

Подтверждена эта матрица Chrome, включая реальный ввод через CDP. Она не доказывает все возможные последовательности, браузеры, внешние upload providers или системные IME. Видимые окна Chrome не открывались. Демо: [127.0.0.1:5173/ru/#demo](http://127.0.0.1:5173/ru/#demo).
