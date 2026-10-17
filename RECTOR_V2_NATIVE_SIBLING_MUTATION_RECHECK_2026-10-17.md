# Rector v2 — native edits followed by media authoring actions

Дата: **17 октября 2026**. Репозиторий: `Shelamkoff/editor`, ветка `refactor/rector-v2-architecture`.

**Начальный HEAD:** `a355cdd2340fcd06d749465f66c6bba6be4a0107`.  
**Результат:** четыре подтверждённых дефекта перезаписи ранее зафиксированного текста устранены в Gallery, Attaches, Image и Embed. Публичные схемы, UX конкретных операций, история и legacy API не менялись.

## Корень ошибки

При корректном нативном `input` `DocumentRuntime` фиксирует новые данные в `DocumentStore`, иногда с `preserveSourceProjection=true`, чтобы не отсоединять активный editable host/не разрушать каретку. При таком сценарии внутреннее `data` экземпляра плагина не обязано сразу обновляться до канонической записи.

Ряд действий спустя несколько секунд формировал новую canonical запись из **старого plugin-local `data`**, записывая её через `context.updateData(() => next)`. В результате UX-операция по соседнему элементу стирала **уже зафиксированные** пользовательские изменения несвязанного поля. Ошибка проявлялась и после успешного native history step — сам canonical commit прошёл, но следующая операция его перезаписывала.

Стандартный контракт `BlockInstanceContext.updateData(producer)` уже предоставляет актуальную каноническую модель. **Решение:** применить изменение через `current => ({...current, ...})`, а не через локальный snapshot. Никакой новый слой состояния не вводился.

## G-N1 — Gallery удаляла актуальную подпись соседнего изображения (P1/P2)

Контроль: изображения A (`Alpha`) и B (`Bravo`). После native edit A имеет в canonical модели `AlXpha`, тогда как local `data.images[0].caption` всё ещё `Alpha`. Клик на кнопке удаления B раньше выполнял `updateData({...data, images: data.images.filter(...)})`, превращая canonical A обратно в `Alpha`.

**До фикса:** `A.caption=Alpha`, B удалён. **После:** `A.caption=AlXpha`, B удалён; существующие `styles/options/layout` сохранены.

Изменения: `updateData` передаёт producer в `context.updateData`, `remove` фильтрует **`current.images`**. Реальная production factory вызвана через `create().element`, `editableFields()`, `remove.dispatch('click')` в signal-aware fake DOM: итог `instance.read().images[0].caption=AlXpha`, 1 author update.

[Коммит](https://github.com/Shelamkoff/editor/commit/fb52d14eb9505e07f460cd7baf38b02f60a164cc).

## A-N1 — Attaches удалял актуальное имя другого файла (P1/P2)

Native plaintext edit имени файла A (`AlXpha`), затем клик удаления B. Ранее использовался `data.files.filter(...)` на устаревшем локальном массиве.

**До:** `A.name=Alpha`, B удалён. **После:** `A.name=AlXpha`, B удалён.

Используется producer `current => ({...current, files: current.files.filter(...)})`. В изолированном production instance протестирован актуальный `file:first:name` и второй `oe-attaches__remove`; `instance.read()` возвращает сохранённое каноническое имя, 1 авторская операция.

[Коммит](https://github.com/Shelamkoff/editor/commit/c25af6dd78b079ba8bdd27c37a34a66040dcbfaa).

## I-N1 — Image заменял URL и одновременно возвращал старую подпись (P1/P2)

Native caption `AlXpha` был зафиксирован, но `openSourceEditor().onSubmit` использовал `updateData({...data,file:{url}})`. В canonical модели возвращалась старая подпись `Alpha` вместе с новой ссылкой.

**До:** source URL изменён, caption откатился. **После:** source URL изменён, caption сохранён. Удаление изображения по-прежнему намеренно сбрасывает его данные целиком, используя `updateData(() => imageDataSchema.createDefault())`.

Контроль: настоящий `createImagePlugin`, сохранённый через публичный `editableFields` native edit, текущий canonical `context.getData()`, нажатие фактической кнопки URL и `openSourceEditor.onSubmit`. После фикса `instance.read().caption=AlXpha`, правильный новый URL и 1 author update.

[Коммит](https://github.com/Shelamkoff/editor/commit/5620919d46060fb20f4962df1ebcc129628feaea).

## E-N1 — Embed заменял идентификатор видео и откатывал подпись (P1/P2)

Обработчик `parseInput()` сравнивал видео с локальным `data` и записывал `commit({...data,...parsed})`. После native изменения caption с `Alpha` на `AlXpha` новая ссылка YouTube уничтожала ранее зафиксированную подпись.

**До:** `caption=Alpha` после смены видео. **После:** `caption=AlXpha`, `videoId` принимает новый ID.

При обработке ввода используется `current=context.getData()` для проверки фактического видео, затем `commit(latest => ({...latest,...parsed}))`. Полная очистка Embed по Delete всё ещё использует `commit(() => emptyData())`. Проверены actual `parseInput` body RED/GREEN и production instance `createEmbedPlugin` через `input`/`Insert.click`: корректное обновление модели, 1 author operation и сохранение подписи.

[Коммит](https://github.com/Shelamkoff/editor/commit/91d08cc32f7b4173cfb2a8618d3fa7cf127706e0).

## Регрессионные тесты

В `tests/browser/native-plugin-parity.js` добавлены **четыре** самостоятельных сквозных сценария (нативный ввод → UI действие → canonical `save` → Undo):

1. Gallery: редактирование первой подписи → удаление второго изображения.
2. Attaches: редактирование первого имени → удаление второго файла.
3. Image: редактирование подписи → выбор нового URL через SourceEditor.
4. Embed: редактирование подписи → замена YouTube URL.

Коммиты: [три media-теста](https://github.com/Shelamkoff/editor/commit/590d8b60a2feb7322b225704184a4d1a225e066c), [корректировка локаторов реального Image/Attaches UI](https://github.com/Shelamkoff/editor/commit/2811e7ce5456dc822e958ba82c9022391811d6ce), [Embed-тест](https://github.com/Shelamkoff/editor/commit/f4635388a52aa1847d09529ae18ca785345e8f28).

Тесты **зарегистрированы, но не исполнялись полным нативным браузерным runner на финальном HEAD**. RED/GREEN выше — фактические исходные JS-модули и event callbacks в controlled V8/DOM adapter, без полноценного `createEditor`/реальных физических клавишных событий. Синтаксические проверки JS не заменяют TypeScript-проверку проекта.

## Отсев ложных находок

Остальные основные composite editor plugins Paragraph/Heading/List/Quote/Code/Checklist/Warning/Raw/Toggle/Columns/Spoiler/Delimiter/Table проверены по маршрутам `context.updateData`/readOnly. Аналогичный прямой producer-путь, заменяющий canonical native rich/plain data из plugin-local `data`, в их основных обработчиках не найден. Для Carousel удаление слайда и управление порядком уже используют `current =>...`, загрузка медиа использует `task.commit(producer)`; ненужные исправления не делались.

Предыдущие исправления защищают сохранение native текста при `readOnly` переходах, а текущие защищают **другой путь** — последующий authoring action при сохранении активного редактирования. Они не дублируют друг друга.

## Открытые проверки

Обязателен полный локальный gate на финальном SHA (`npm test`, `npm run typecheck`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package`), реальный IME и v1/v2 differential. CI не использовался. Итоги прошлых проверок более раннего SHA не приписываются новой ветке.

**Заключение:** четыре конкретных дефекта сохранности данных исправлены с RED/GREEN доказательствами. Релизная стабильность всей библиотеки и полный паритет v1 ещё не доказаны.
