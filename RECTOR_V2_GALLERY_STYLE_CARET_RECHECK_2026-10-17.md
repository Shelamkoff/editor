# Rector v2 — аудит редактирования Gallery при смене оформления

Дата: 17 октября 2026 г.  
Ветка: `refactor/rector-v2-architecture`.  
Исходный HEAD: `8bdfe841679c2854541449cb74c1a3c17468bfa1`.  
Приоритет находки: **P2 (потеря native focus/caret на обычном style-only update)**.

## Вывод

Подтверждён и исправлен дефект `plugins/gallery/index.js`: изменение исключительно `styles` без изменения изображений, их подписей, `layout` и `options` вызывало полную перестройку Gallery. `wrapper.replaceChildren()` удалял редактируемый `contenteditable` подписи и сбрасывал focus/selection. При этом обновление только CSS не требует замены авторского поля.

Исправление ограничено **style-only / no-op** путём, оставляя полноценный `project(next)` при изменении изображений, раскладки, режимов, read-only и во время открытой панели настроек. Legacy v1 API/схемы не восстанавливались, новая глобальная архитектура не вводилась.

## Процедура TDD и доказательства

### RED: потеря редактируемой подписи

На фактическом production `createGalleryPlugin()` (`plugins/gallery/index.js`, Git blob `5ffdb199cd13faccf0789fe62c3747f4f9de0cf6`) в изолированном V8 с DOM-моделью:

1. Смонтирована галерея с двумя изображениями; `image:a:caption` получил фокус.
2. Вызван `instance.update({...data, styles:{gap:'12px'}})`.
3. Результат: новый `editableFields()[0].element` не равен старому; focus на старом элементе отсутствует. CSS `gap` в новой проекции корректен, но каретка разрушена.

### GREEN: точечное обновление оформления

Добавлен узкий `update(next)` для текущей canonical структуры:

- Сравниваются `id/url/caption` элементов, `layout` и текущие `options`. Если отличаются — применяется исходный `project(next)`.
- При совпадении авторских изображений/раскладки и закрытой панели: обновляются `data`, `wrapper.style`, `grid.style.gap`, `grid.style.height` и `borderRadius` видимых слотов без перемещения editable hosts.
- При удалении этих стилей значения CSS сбрасываются; пустые значения не сохраняются.
- В открытой панели сохраняется прежний путь полного `project(next)`, чтобы не оставлять неоднозначное состояние форм во время взаимодействия.

Первая итерация: [тесты](https://github.com/Shelamkoff/editor/commit/d723c24ea155a09bb422c97f67cac162fdcbe026), [исправление caption-safe styles](https://github.com/Shelamkoff/editor/commit/b9458ee470b312bd36bddad00e6db9e242ba33f2).

### Отдельная RED-проверка настроек

Изолированная проверка промежуточного Blob `9043754a579ae581b3a9433b7c2f450a79609c82` обнаружила новый побочный эффект: подпись и фокус сохраняются, но скрытые controls `Gap`/`Border radius` после внешнего style update показывают старые значения `''`, пока CSS уже равен `12px`/`8px`.

Вторая итерация обновляла hidden settings form целиком, что исправляло значения, но создавало лишние новые input DOM/lifetimes. Поэтому добавлен **контроль сохранения идентичности самих settings inputs**.

Окончательное решение:

- При создании style-input проставляется `data-gallery-style` с ключом `gap`, `borderRadius` или `height`.
- Style-only `update` синхронизирует `control.value` **на существующих inputs**, не пересоздавая их.
- Сигналы и обработчики форм остаются прежними; лишних новых обработчиков или устаревших форм во время такого обновления нет.
- Отрисовка Settings при настоящем `project(next)` продолжает использовать общий ранее существовавший `renderGallerySettings()`.

Коммиты: [regression on settings freshness](https://github.com/Shelamkoff/editor/commit/3ddc1d677edef5e0cefb1c63bf23d0f63c7180fa), [first settings sync](https://github.com/Shelamkoff/editor/commit/766f15c4d5c85393c02f445703cff3247f1bd95e), [settings input identity regression](https://github.com/Shelamkoff/editor/commit/c4ac4f0359741dfe53f9331807b5d4eff3cd1d2f), [final in-place form values](https://github.com/Shelamkoff/editor/commit/57196cce801d78f67fad960cd5ed0dc7e7c6485d).

### Финальный прогон ограниченного контура

После финальной правки протестирован точный Git Blob `a382f75a9f2e0d1472ecaf6bf75c7994a989cee2` в изолированной V8-среде на production factory с контролируемым DOM-adapter. **240/240** детерминированных изменений `gap`, `height`, `borderRadius` прошли:

- идентичность и фокус `image:a:caption` сохранены;
- значения трёх уже созданных input controls совпадают с canonical `styles`;
- `grid.style.gap/height` и border radius видимого слота совпадают с моделью;
- удаление стиля очищает CSS и value поля;
- после отдельного изменения состава/media данных `project(next)` по-прежнему заменяет прежний editing host и отражает новую canonical модель.

**Оговорка:** эта проверка выполнялась на полном тексте production factory, но с подменёнными внешними зависимостями (style helper, uploader, DOM, media). Это не реальный Chromium end-to-end и не общий пакетный Node test runner.

## Регрессии в репозитории

Добавлены два сценария в `tests/browser/native-plugin-parity.js`:
1. Gallery style-only update при focused caption: ожидаются сохранение focus/caret, корректные `gap/height/borderRadius`, актуальные скрытые Settings controls и ввод текста с Undo;
2. No-op + удаление стилей: нет лишней замены caption и скрытых Settings inputs, значения стилей очищаются.

Существующая регрессия о **retired Gallery controls** скорректирована: теперь принудительная замена UI вызывается **реальным изменением изображения**, а не сменой стиля, который обязан сохранять focus. Так оба контракта независимы.

Новые browser tests зарегистрированы, синтаксис JS проверен, но **полный проектный browser runner ещё не выполнялся на окончательном SHA**.

## Другие проверки и отсеянные предположения

- `Gallery` уже использует `viewController.signal` для событий временных DOM-кнопок; прежний фикс lifecycle сохранён.
- `SourceEditor` кэширует surfaces по wrapper + владельцу `AbortSignal` и заменяет их при смене сигнала; сам по себе этот кэш не является доказательством утечки.
- `Carousel` использует другой набор UI-зависимостей, включая autoplay/navigation/thumbnail state. Перенос Gallery fast path на него без отдельной регрессии был бы спекулятивным; код Carousel этим проходом не менялся.
- Выбранный локально материализованный ранее набор моделей DocumentStore/TransactionEngine/HistoryStore/NativeInputController прошёл **39/39 Node tests**. Это исходники прежнего subset-checkout, **не** полный `node --test` для нового HEAD с Gallery.

## Что остаётся для приёмки

Полный локальный `npm ci`, `npm test`, `npm run typecheck`, `npm run test:browser`, `npm run test:types`, `npm run test:package`, `npm run test:docs`; native OS IME, cross-browser, heap/retention и полный behavioral differential v1/v2 не подтверждены на новом HEAD.

**Статус:** целевые Gallery проблемы закрыты с отрицательными и положительными контролями. Общую стабильность всей библиотеки Rector v2 пока нельзя объявить доказанной.
