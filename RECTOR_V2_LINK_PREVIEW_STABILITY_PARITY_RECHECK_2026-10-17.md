# Rector v2 — LinkPreview и восстановление истории: регрессионная проверка

**Дата:** 17 октября 2026.  
**Ветка:** `refactor/rector-v2-architecture`.  
**Исходный HEAD:** `4fd6a1ca7034236adee5f126b24bf2a5c42d902d`.  
**Последний кодовый коммит этого прохода:** `4130b33ff78c787418bd0120ebef74d9d28a5d08`; позднее добавлено браузерное покрытие.  
**v1 для сопоставления:** `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

## Краткий результат

В `plugins/link-preview/index.js` исправлены подтверждённые ошибки владения вводом, асинхронными запросами и первичной загрузкой метаданных. В `core/BlockReconciler.js` восстановлена явно обозначаемая фаза создания плагина при Undo/Redo и восстановлении после отказа. Она нужна, чтобы плагины не повторяли автоматические побочные эффекты при реконструкции уже существующего документа.

**Точечные проверки после исправлений:** **11/11** тестовых сценариев LinkPreview при исполнении фактического production-кода плагина с контролируемыми DOM, URL/таймерами и data-task адаптерами; **1/1** сценарий production `BlockReconciler` с настоящей регистрацией теста и ограниченными подставными collaborators. Это **не** полный Node/npm/browser gate и **не** доказательство полного паритета библиотеки с v1.

### LP-1 — черновик URL и таймер терялись при изменении шаблона

`project(next)` безусловно заменял значение активного `input` и отменял debounce. Обновление шаблона, title или description приложения стирало введённый URL даже без изменения адреса. Если URL уже был зафиксирован нативным вводом без reprojection, тот же путь отменял ожидающую обработку. Введённый URL и **первоначальный** таймер теперь остаются активными только пока не изменился принадлежащий документу источник; при смене canonical URL или read-only черновик отзывается.

RED: 2 из первоначальных 4 сценариев падали. GREEN: все 4 прошли после [исправления](https://github.com/Shelamkoff/editor/commit/24b45624f6f65e13cdce5729a5342278502e7e34).

### LP-2 — устаревшие metadata result и task lease

Поздний `fetchMeta` раньше заменял новое название, заданное хостом, и не получал немедленный abort при внешней смене URL. Запрос теперь отзывается при смене источника/read-only. Результат применяет только те metadata-поля, которые ещё равны baseline, зафиксированному в момент старта запроса, и только если URL совпадает.

RED: ещё два сценария падали. GREEN: набор из 6 проходил после [исправления](https://github.com/Shelamkoff/editor/commit/29dc91bd7287754db9092e1d04bbed3b01c1534c).

Отдельно проверен отзыв полномочий **после успешного `beginTask()`, но до получения `getData()`**. До фикса новая задача оставалась активной, а исключение выходило за пределы блока `finally`. Снимок теперь читается внутри `try`, поэтому `finally` гарантирует `task.cancel()` на этом пути. RED: 6/7, GREEN: 7/7. [Исправление](https://github.com/Shelamkoff/editor/commit/a4e02633af7c03b9bc4ffedee2dbe2c8d33b4aed).

### LP-3 — отложенная первичная загрузка перезапускала запрос нового URL

На создании блока с неполными метаданными ставился `queueMicrotask()`, который брал **изменяемое** `data.url`. Если пользователь успевал в той же задаче отправить новый адрес, первичная microtask запускала запрос нового адреса повторно и прерывала более свежую операцию. Теперь задача запоминает исходный адрес и пропускает исполнение после отправки другого URL, появления активного metadata task или добавления метаданных приложением.

RED: 7/8; после [исправления](https://github.com/Shelamkoff/editor/commit/546b8c9958431ec6f4c9c1a3fb2bac95d2a52087) 8/8. Добавлены положительные проверки обычной первоначальной загрузки и отсутствия запроса после получения метаданных от host: 10/10.

### LP-4 — восстановление истории и повторное сетевое обогащение

README плагина уже требовал подавлять автоматическое обогащение при Undo/Redo, но `BlockInstanceContext` и `BlockReconciler` не передавали признак `restoring`. Плагин мог запускать новый сетевой запрос при повторном создании старого блока.

Изменения:
- `BlockReconciler.prepare()` обрабатывает `origin: 'history'`; новый block instance получает `restoring: true`.
- Полный `restore()` и восстановление после неудачной проекции создают новые экземпляры с `restoring: true`. Обычное создание получает `false`.
- В `plugin-kit/types.d.ts` опубликован необязательный read-only `restoring`.
- LinkPreview не запускает **автоматическое** metadata enrichment при `context.restoring === true`, но явный ввод нового URL продолжает работать.

Исправления: [reconciler](https://github.com/Shelamkoff/editor/commit/8910968d4bb90cee692a625d758452a1865ebde3), [types](https://github.com/Shelamkoff/editor/commit/a02685c82f50d14fd8cfdd4102172e8958376d12), [plugin](https://github.com/Shelamkoff/editor/commit/4130b33ff78c787418bd0120ebef74d9d28a5d08).

Итог: **11/11 LinkPreview**, **1/1 BlockReconciler** целевых сценариев на изолированных исходниках и тестовых адаптерах. Полный `core/BlockReconciler.test.js` не запускался.

## Зафиксированные тесты

- [plugins/link-preview/input-lifetime.test.js](plugins/link-preview/input-lifetime.test.js) — 11 сценариев: native URL lease, debounce, host updates, отмена старого запроса, ошибка snapshot acquisition, initial metadata race, обычная загрузка и отсутствие повторного запроса на replay.
- [core/BlockReconciler.test.js](core/BlockReconciler.test.js) — создание в обычной user-транзакции, истории и recovery.
- [tests/browser/native-plugin-parity.js](tests/browser/native-plugin-parity.js) — 5 дополнительных сценариев: caret и typing/Undo при host update; незавершённый URL; late metadata vs host; Undo без повторного metadata fetch; microtask исходного metadata fetch vs новый URL. Добавления прошли проверку синтаксиса, но **не выполнены в реальном браузерном раннере**.

## Отдельная незакрытая граница паритета v1

В [оригинальном LinkPreview v1](https://github.com/Shelamkoff/editor/blob/5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340/plugins/link-preview/index.js) путь нового URL ожидает `_resolveMeta()` и фиксирует URL + метаданные в одной `context.mutate()`. В текущем v2 `commitUrl()` сначала сохраняет URL в canonical store, а `task.commit()` позже сохраняет metadata. Эти пути **различаются по моменту фиксации и могут различаться границами Undo/Redo**. README v2 пока описывает один шаг. Эта запись является **открытой проверкой строгого поведенческого паритета**, а не утверждением, что выполнен независимый полнофункциональный v1/v2 браузерный дифференциал. Не следует подменять функциональную возможность адаптером legacy API или изменять semantics истории без явного сценарного proof.

## Остаток релизной приёмки

Полный checkout с зависимостями в этой среде недоступен (GitHub hostname не разрешается из контейнера). GitHub connector даёт исходники и возможность коммитить, но не выполняет весь npm проект. Следовательно следующие команды **не были запущены на финальном SHA**:

```sh
npm ci
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Дополнительно необходимы настоящий Chromium+IME/selection/focus, multi-editor/Trusted Types, heap/resource lifetime, installed-package smoke и матрица верификации всех 21 block types и 12 inline tools по v1. **Вывод:** подтверждённые дефекты выбранного контура исправлены, целевые тесты проходят; полная стабильность библиотеки и весь паритет с v1 пока не доказаны.
