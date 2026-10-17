# Rector v2 — Columns, JSON no-op и стабильность истории

Дата: 17 октября 2026 года. Ветка: `refactor/rector-v2-architecture`.

Исходный HEAD прохода: `1faf75a0fa6c94fbe6a229aa9994fd58cafcea67`. Кодовые коммиты: [Columns](https://github.com/Shelamkoff/editor/commit/fa5341f182a0011a0213cca452fc02825d33c643), [публичный update](https://github.com/Shelamkoff/editor/commit/4e4e42b129bb229250deb5c4d3d78dce63f5f999), [projection sync](https://github.com/Shelamkoff/editor/commit/5b0e368c624834ec9604a3744a207b68c173b41f).

## Результат

В этом проходе подтверждены и устранены три дефекта. Все обнаруженные в ограниченном исполняемом контуре регрессии исправлены; полную релизную стабильность всего Rector / полный поведенческий паритет v1 с v2 не объявляем.

### C1 — Columns переносил редактируемые DOM-узлы даже без изменения порядка (P2)

В `plugins/columns/index.js` метод `reconcile()` вызывал `grid.appendChild(element)` для **каждой** существующей колонки на каждом `update()`. Это перемещает подключённый DOM-элемент даже при полностью идентичном обновлении или изменении только `layout`. Перемещение редактируемого элемента уничтожает привязку нативной каретки и может сбросить фокус.

Исправление: если `grid.children[index]===element`, DOM не затрагивается. Если авторский порядок поменялся, `insertBefore(element, grid.children[index]??null)` выставляет правильный порядок с минимальным количеством перемещений.

- До изменения: из трёх регрессионных тестов **1 PASS, 2 FAIL** — именно проверки ненужных перемещений.
- После изменения: **3 PASS**.
- Добавлен независимый детерминированный тест со **500 шагами** вставки/удаления/перестановки/смены layout/no-op, сравнивающий авторскую последовательность и DOM. Итог: **4/4 PASS**.
- В Chromium на настоящем редактируемом DOM: наивный `appendChild` оставляет корректный порядок текста, но теряет `selection.anchorNode`, offset 2→0 и активный элемент. Условное сохранение прежних `children[index]` удерживает anchor, offset 2 и focus. Это **нативное доказательство механизма**, не full-plugin browser acceptance.
- Зарегистрированы два теста в `tests/browser/native-plugin-parity.js`: редактирование соседней колонки и layout-only update с кареткой, вводом, Undo/Redo. Они не заявляются выполненными на полном `createEditor`.

Коммиты: [тесты](https://github.com/Shelamkoff/editor/commit/bb811ba3561f68f22ee39e8d15f055a3778b3205), [исправление](https://github.com/Shelamkoff/editor/commit/fa5341f182a0011a0213cca452fc02825d33c643), [браузерная регистрация](https://github.com/Shelamkoff/editor/commit/1bf9f003ee9ec27cbf8d1614632e66f36f9e8337), [модель 500 шагов](https://github.com/Shelamkoff/editor/commit/82f12b7adea1f218d1380bb5e5b31222ae4e2ec7).

### J1 — блоковый update создавал Undo при иной очередности JSON-ключей (P2)

`DocumentRuntime.update()` ранее сравнивал `data/tunes/inline` с помощью `JSON.stringify()`. Например `{nested:{left:1,right:2},list:[{a:1,b:2}]}` и тот же объект с ключами в обратном порядке считались изменением. В результате `blocks.update()` создавал фиктивный авторский revision и history.

В библиотеке уже существует `canonicalRecordsEqual()`, который сравнивает значения JSON без зависимости от порядка **ключей объектов**, сохраняя чувствительность к порядку массивов и собственным отсутствующим полям. `#updatedRecord()` уже пользуется этим контрактом. Публичный update приведён к нему без новых примитивов.

Тест `core/DocumentRuntime.test.js`: same-content reorder — revision/Undo не меняются; изменение реального значения — revision + 1, доступен Undo, undo восстанавливает прежний payload.

Изолированная исполняемая проверка реального текста `DocumentRuntime.js` с упрощённым engine/store и настоящим `canonicalRecordsEqual`:
- **RED:** фиктивная ревизия 0→1, `canUndo=true`;
- **GREEN:** сценарий проходит вместе с контролем реального изменения.

Коммиты: [регрессия](https://github.com/Shelamkoff/editor/commit/91a4b9c3388c626ee1a90b7c434f0fc526fb49a7), [исправление](https://github.com/Shelamkoff/editor/commit/4e4e42b129bb229250deb5c4d3d78dce63f5f999).

### J2 — проекция создавала phantom native history при reorder-only JSON (P2)

`DocumentRuntime.syncBlocksFromProjection()` применял такой же `sameJson` к canonical/projection data. Плагин, возвращающий семантически тот же объект с другой очередностью собственных ключей, мог генерировать дополнительный history step после DOM-синхронизации.

Исправление: используется `canonicalRecordsEqual(current,next)`, включая актуальные `dataVersion`, `tunes`, `inline`; изменения данных и inline остаются реальными авторскими операциями.

Тест с custom schema / projector: одинаковое JSON-содержимое в другом порядке не изменяет history; реальная правка одного значения фиксируется и отменяется.

- **RED:** первый из двух новых тестов (J1) проходит после своего фикса, второй (J2) падает на «reordered object keys created a phantom native edit».
- **GREEN:** оба проходят после фикса J2 на актуальном источнике.

Коммиты: [регрессия](https://github.com/Shelamkoff/editor/commit/f78b7e6b4f5a125258c5a151a90a10dff3f08adf), [исправление](https://github.com/Shelamkoff/editor/commit/5b0e368c624834ec9604a3744a207b68c173b41f).

## Отсеянные предположения и ограничения

- `Checklist` уже использует позиционную проверку перед `insertBefore`; переписывать его по аналогии с Columns **не требуется**.
- Текущий `CanonicalTransforms.js` уже обладает правильной структурной моделью равенства; менять сравнение схем, JSON serialization или нормализацию массива **не требуется**.
- Полный `renderer`/media, плагины Person/Gallery/Carousel и расширения, не затронутые выше, **не были в этом проходе полностью регрессионно протестированы**.

Тесты Columns запускались на фактическом production module с контролируемым DOM и заглушёнными внешними источниками стилей/санитайзера; использовались пустые authored text fields. В тестах runtime использовался фактический текст `DocumentRuntime.js` и `canonicalRecordsEqual()`, но с контролируемыми реализациями transaction store/engine: это **не** полный реальный `DocumentStore + TransactionEngine` run. New Node-тесты зафиксированы в репозитории и предназначены для обязательного запуска в нативном Node test runner на полном checkout.

Не выполнены на этом SHA: полный `npm test`, оба проектных typecheck, все browser/native matrices, installed-package tests, docs, heap/retention, настоящий OS IME, Firefox/WebKit и комплексный v1/v2 behavioral differential. Результаты исторических прогонов других SHA к этим изменениям не приписываются.

**Итог:** три подтверждённых дефекта исправлены с red/green контролями. Полный вывод «вся библиотека стабильна» до финальной интеграционной приёмки остаётся недоказанным.
