# Rector v2 — повторная проверка жизненного цикла drag-and-drop

**Дата:** 17 октября 2026  
**Ветка:** `refactor/rector-v2-architecture`  
**Начальный HEAD:** `0596dfd50a3d15791dab7ac05d553f3304583563`

## Результат

Подтверждены и устранены **два дефекта состояния перетаскивания при смене DOM-проекции** в Person и Gallery. Плагинам не добавлялись новые публичные возможности, устаревшие API, новые менеджеры или независимые хранилища. Оба исправления ограничены уже существующими lifecycle-операциями.

Полную стабильность Rector v2 и весь пользовательский паритет с v1 этот проход **не доказывает**.

### DND-1: старый drag Person переживал замену вкладок (P2)

`plugins/person/index.js` хранит `dragId` как локальное состояние блока. Обработчик `dragend` освобождал его, но при обновлении данных соседнего человека `update()` пересоздаёт `renderTabs()`: прежние `tab` удаляются, а их обработчики уже правильно отозваны `tabsController.abort()`. Новый `dragend` для старого источника поэтому не обязан приходить.

После такого обновления новый `tab` получал `dragover` и `drop` со старым `dragId`. До исправления свежий `dragover` неправильно вызывал `preventDefault`, сообщая о наличии активной внутриблочной перестановки. Возможна фантомная перестановка от ранее удалённого источника.

**Исправление:** в начале `renderTabs()` выполняется `dragId=null`, перед отзывом старого signal. Жизненный цикл редактируемой карточки не меняется.

**Red/green:** `plugins/person/reconciliation.test.js`, два новых теста:
- Прервать drag на вкладке A изменением данных B и выполнить dragover/drop на новой вкладке B: оба события больше не принимаются как продолжение старого drag.
- Начать новый drag на свежей A: новая B принимает dragover; после нормального dragend блок возвращается в обычное состояние.

Изолированный запуск **всех настоящих 10 тестовых функций** `reconciliation.test.js` на фактическом тексте production `createPersonPlugin()` с контролируемым signal-aware DOM:
- до патча — **9/10 PASS**, падает только новый interrupted-drag сценарий;
- после патча — **10/10 PASS**;
- ранее защищённые native editable identity, актуальная подпись вкладки, local readonly и 400 детерминированных sibling updates сохраняют прежний результат.

Коммиты: [регрессии](https://github.com/Shelamkoff/editor/commit/5a441582912cb9a4f9420649c443a7a78625d438), [исправление](https://github.com/Shelamkoff/editor/commit/bd13e415d514a46f8a0c3034e9994bbb8761aac1).

### DND-2: устаревший drag Gallery блокировал File drag после перерисовки (P2)

`plugins/gallery/index.js`: `project(next)` правильно отзывает старые `viewController.signal` и DOM кнопок/слотов, но прежде не сбрасывал `dragId`, установленный `dragstart`. Если обновление авторских данных перепроецировало галерею во время перетаскивания, `dragend` удалённого слота не гарантирован. Тогда постоянный `wrapper.addEventListener('dragover')` считает перетаскивание внутренних изображений активным и пропускает обычный `Files` drag без `preventDefault` и `dropEffect='copy'`.

**Исправление:** в начале полноценного `project(next)` перед `viewController.abort()` сбрасывается `dragId=null`. Недавний style-only fast path при неизменных изображениях **не сбрасывает** действующую внутриблочную перестановку, поскольку не меняет слоты.

**Red/green:** настоящий текст `createGalleryPlugin()` запущен изолированно с управляемым `dragstart` и File `dragover` event (signal-aware DOM adapter). Проверяется полный публичный путь `create().element / update()`:
- перед пересозданием, пока активен внутренний drag: `File dragover.defaultPrevented=false` — корректно, файлы не смешиваются с переносом изображения;
- после полного `update()` данных соседнего изображения: **RED** `defaultPrevented=false` (устаревший drag), **GREEN** `defaultPrevented=true` (File снова принимается);
- новое реальное `dragstart` на свежем слоте снова приостанавливает File drag (`defaultPrevented=false`), а обычный `dragend` восстанавливает его (`defaultPrevented=true`).

Коммит: [исправление](https://github.com/Shelamkoff/editor/commit/accce662c3cd9c8a30b467b1f087d8e53c8fa562).

## Интеграционные регрессии

В `tests/browser/native-plugin-parity.js` добавлены два сценария с полным public editor `blocks.update`:

1. Gallery: синтетический `dragstart` на source slot, программное author обновление B, затем File `dragover` на `wrapper`. После обновления событие должно быть consumed как file drag, `dropEffect='copy'`.
2. Person: dragstart на старой A, обновление B с пересозданием tabs; новая B не принимает ghost dragover, но принимает dragover нового `dragstart`.

[Коммит browser tests](https://github.com/Shelamkoff/editor/commit/52893ca3b9e1b6eb9533691c542a7bb5ecb813c4).

**Эти новые сквозные браузерные тесты зарегистрированы, но не исполнены в проектном браузерном runner на актуальном HEAD.** Изолированные проверки сигнальной модели и DOM жизненного цикла не эквивалентны ручному нативному drag-and-drop в Chromium или Firefox.

## Проверки после коммитов

Проверены live blobs:
- `plugins/person/index.js` — `e284afd74aebf67bcc029feeaab7885868bafeb1`;
- `plugins/person/reconciliation.test.js` — `0cd031b06b8b09374e1dad9465b1ef57e9f09f36`;
- `plugins/gallery/index.js` — `674074de6b9012e54412456506d7435b70ade593`;
- `tests/browser/native-plugin-parity.js` — `d1a8cb939899074722bbfd478e10a79f88becd14`.

Все четыре изменённых JS-файла **синтаксически разобраны** в изолированном V8 после снятия ESM imports/exports. Сверка GitHub: исходный HEAD → 4 коммита исправлений, **0 behind**, только эти четыре файла.

### Отсеянные ложные срабатывания

- Gallery style-only `update(next)` не разрушает DOM слотов: активное перетаскивание не нужно отменять без смены источника. Сброс привязан к **полноценному** `project(next)`.
- Carousel и Attaches используют wrapper File drag без локального идентификатора активной внутриблочной перестановки; переносить в них этот сброс не требуется.
- User-input/state dispatch из старых слотов уже изолирован предыдущими исправлениями per-view AbortController; дефект этого прохода — **сохраняющийся dragId в владельце**, а не повторная утечка старого event listener.

## Ограничения

На этом SHA **не выполнены** полный checkout/npm unit runner, TypeScript, общий browser suite, реальный OS-native drag/drop, IME, package-consumer, docs, heap/retention и полный differential v1/v2. Результаты старых исторических SHA не приписываются этой проверке.

**Вывод:** два подтверждённых drag lifecycle дефекта исправлены с red/green регрессиями; до полной локальной приёмки стабильность всей библиотеки не объявлять.
