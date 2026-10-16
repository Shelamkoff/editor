# Rector v2 — резюме глубокого аудита 22865b5

## Ревизия и вывод

Проверенная ревизия: `22865b5415c385ebe88d6bcb8b2fea59f1137a5a`, ветка `refactor/rector-v2-architecture`. Эталон v1: `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`. До записи данного отчёта удалённый кодовый HEAD повторно проверен и совпал с проверенной ревизией.

**Поведенческий паритет с v1 не достигнут в проверенных сценариях.** Обнаружены три конкретных расхождения, в том числе два блокирующих приёмку. Архитектурная основа единого committed document, транзакций, истории и отзываемых scopes обоснована; переписывание всей библиотеки не рекомендуется. Требуются согласованные изменения на стыках существующих модулей, а не новый state store или compatibility layer.

Production-код в этом аудите не изменялся. Находки ниже остаются открытыми. Полный отчёт и пакет тестов/исходников/логов переданы отдельно в ответе на запрос аудита.

## Область и доказательства

Исследованы сквозные контуры модели, истории, транзакций, scopes/задач, расширений, popup/Mention, Clipboard/ranges, текстовых и составных блоков, рендеринга, sanitizer и packaging. Это не заявление о завершённой построчной проверке всех файлов репозитория.

Полный checkout получить не удалось: сетевые обращения контейнера к GitHub не разрешались. Данные читались через GitHub connector на фиксированном SHA. Для исполнения локально материализованы девять полных модулей с проверкой Git blob SHA-1; исходный текст этих модулей не изменялся.

Окружение: Linux, Node.js 22.16.0, Chromium 144.0.7559.96. Browser probe исполнял настоящий DOM и bundle трёх исходных popup-модулей через TypeScript 5.8.3; это не проверка проекта на закреплённом TypeScript 5.9.3. Отдельные planner/методовые проверки использовали явно обозначенные выдержки функций, а не целый редактор. Субагенты не запускались: инструмента их исполнения в этой сессии нет.

Реально выполнено:

- 64 независимых Node-теста на исходных DocumentStore/HistoryStore/TransactionEngine/InstanceScope: 64 PASS, 0 FAIL, 0 skipped. Это не штатный полный `npm test` репозитория.
- 40 seeds × 250 шагов = 10 000 шагов сравнения document/history с независимой snapshot-моделью. Не браузерные жесты.
- В Chromium воспроизведена конфликтующая с Mention последовательность повторного вызова исходного popup host. Прошли три положительных контроля: fresh surface/stale handle, защита connected anchor и outside-click cleanup.
- Сравнены выражения проверки пустоты Paragraph v1/v2 на 8 HTML-примерах в Chromium; найдены 4 расхождения.
- Выполнен извлечённый исходный planner `prepareInsertLocalBlocks`; его результат применён полным оригинальным DocumentStore. Подтверждено сохранение выделенного anchor без изменения при структурной HTML-вставке. Положительный контроль пустого target прошёл.
- Выполнена исходная функция `canonicalRecordsEqual`: подтверждена чувствительность к порядку ключей объекта.
- Измерены одиночные транзакции для четырёх размеров документа, по 80 измеренных итераций после прогрева.

Исторические цифры прежних отчётов — 730 Node tests, 27 browser suites и 1900 native cases — не объявляются результатом этого SHA.

## R1 — P1: Mention несовместим с новым контрактом popup

Источники: [Mention](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/inline-plugins/mention/index.js), [host](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/core/InlinePopupHost.js), [trigger controller](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/core/InlineTriggerController.js), [registry](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/core/ExtensionRegistry.js).

`Mention.schedule(session)` создаёт popup только при `!popup`. На следующем запросе переиспользует существующую поверхность и снова передаёт её в `showPopup()`. Registry непосредственно пересылает вызов с владельцем runtime. Но host до закрытия прежней презентации отклоняет `root.contains(content)` и `content.isConnected`. После первого открытия это верно для повторно переданного списка.

На настоящем Chromium повторный вызов исходного host выбрасывает `TypeError: Popup requires owning-document HTML elements and optional cleanup function`. По текущему контроллеру ошибка `onTriggerQuery` отменяет сессию. Полный нативный ввод `@a` в собранном редакторе в данном проходе не запускался; доказательство состоит из source trace штатного потребителя и исполнения его host-последовательности.

Причина: контракт принимающей стороны ужесточён без согласованной миграции встроенного потребителя. Сам запрет похищения чужого DOM сохранять необходимо.

Исправление: обновлять содержимое уже принадлежащей активной презентации поверхности без повторного acquisition либо корректно закрывать прежнее владение перед новым detached surface. Отдельно учитывать смену anchor/session и запоздавшие search results. Не вводить второй popup manager.

Приёмка: настоящий Mention + настоящий host: `@` → несколько букв → Backspace → выбор Enter/мышью → Undo/Redo; read-only round trip, редактирование существующего mention и два редактора.

## R2 — P1: структурная HTML-вставка теряет локальное выделение

Источники: [router](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/core/HtmlImportRouter.js), [controller](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/core/ClipboardController.js), [planner](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/core/ClipboardPlans.js), [v1 insertion](https://github.com/Shelamkoff/editor/blob/5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340/core/clipboard/pasteInsert.js).

Два paragraph-root возвращаются router как `kind: blocks`. Локальная ветка вызывает `insertLocalBlocks(anchorId, blocks, {replaceEmpty: ...})`, не передавая сам диапазон. Planner умеет заменить пустой anchor либо добавить блоки после него, но не заменить выделенные символы.

Пример:

```
Исходно: abc[DEF]ghi
HTML:    <p>X</p><p>Y</p>
v1:      abcXghi | Y
План v2: abcDEFghi | X | Y
```

План v2 воспроизведён извлечённой исходной функцией с явными сервисами уже импортированных paragraph-данных; исходный DocumentStore применил две операции insert без обновления anchor. Семантика v1 прослежена до `Range.deleteContents()`/`insertNode()`.

Исправление: использовать существующий range-aware clipboard pipeline для пользовательской структурной вставки в rich-text selection. Сохранить prefix/suffix, sidecars, identity и одну историю. Не копировать второй алгоритм замены диапазона в controller.

Приёмка: collapsed/noncollapsed, прямое/обратное локальное выделение, несколько HTML-частей, разные текстовые блоки, Undo/Redo. Межблоковый путь тестировать отдельно: находка не доказывает поломку всех видов Paste.

## R3 — P2: raw HTML ошибочно определяет визуальную пустоту

Источники: [Paragraph v2](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/plugins/paragraph/index.js), [Paragraph v1](https://github.com/Shelamkoff/editor/blob/5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340/plugins/paragraph/index.js), [schema](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/shared/blockSchemas/paragraph.js).

v1 проверяет `element.textContent?.trim()`, v2 — `data.text.trim()`, где text является HTML. `<br>`, `<b></b>`, `&nbsp;`, `<b>&nbsp;</b>` дают true в v1 и false в v2. Пустая строка/пробел и обычный непустой текст служат положительными контролями. Schema сохраняет строку, а sanitizer не удаляет всякую пустую разметку.

Аналогичный pattern присутствует в List, Poll и Table. В List он участвует в выборе выхода из пункта по Enter. Последствия для каждого native-жеста ещё требуют интеграционной проверки.

Исправление: согласованная нейтральная семантика rich-text emptiness с учётом entities, тегов и настоящих inline references. Не strip-tags regex и не удаление данных ради решения об операции. Реальный widget не должен считаться пустым только из-за отсутствия подписи.

## A1 — P2: контейнерная стоимость одиночной транзакции O(N)

Источник: [DocumentStore](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/core/DocumentStore.js).

`createDraft()` копирует массив порядка и Map записей; `prepareCommit()` через `snapshotState()` снова копирует эти контейнеры. Неизменённые payloads разделяются: это не глубокое копирование всего документа. Но стоимость контейнеров уже линейна по общему числу блоков.

Оригинальный TransactionEngine, no-op projector, Linux/Node 22.16, 80 измерений после 10 прогревочных:

| Блоков | Медиана, мс | p95, мс |
|---:|---:|---:|
| 100 | 0,097 | 1,086 |
| 1 000 | 0,335 | 1,411 |
| 10 000 | 5,986 | 33,927 |
| 50 000 | 35,089 | 72,714 |

Это core-only benchmark, не latency браузерного ввода и не прогноз для любых машин. Нужны явный поддерживаемый размер документов и size-budget gate. Возможное направление — copy-on-write/структурное разделение внутри существующего DocumentStore, без второго authoritative store.

## A2 — P2: сравнение канонических записей зависит от порядка ключей

Источник: [canonicalRecordsEqual](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/core/CanonicalTransforms.js).

`JSON.stringify` для data/tunes/inline считает `{a:1,b:2}` и `{b:2,a:1}` разными. Результат false подтверждён выполнением функции. Из её применения в updatedRecord следует риск лишних изменений/истории/уведомлений для сторонних схем; полный public update для этого случая не исполнялся.

Нужна единая структурная семантика сравнения owned JSON либо согласованная канонизация. Порядок массивов сохраняет значение. Не перечитывать raw caller getters и не наращивать стоимость горячего пути случайной сортировкой в каждом контроллере.

## A3 — P3: неиспользуемые DOM helpers в List

В [полном модуле List](https://github.com/Shelamkoff/editor/blob/22865b5415c385ebe88d6bcb8b2fea59f1137a5a/plugins/list/index.js) `fragmentHtml`, `splitAtCaret`, `atStart` не экспортируются и не вызываются. Активный путь использует `context.splitField`. Это подтверждённый остаток, а не runtime crash. Удалять после фиксации активного пути и его тестов.

## Архитектурная оценка

Сохранять единый committed document, transaction/history owners, staged/active/revoked scopes, schema-owned rich fields и нейтральные planners. 64 независимых теста подтвердили существенные invariants этих базовых модулей, но не всех браузерных потребителей.

Главный риск — межмодульное соответствие producer → adapter → owner → consumer. Дополнительные guards без реального built-in consumer test могут ухудшить поведение; R1 является конкретным примером. Жёсткий контракт и его штатные потребители должны меняться вместе.

Изучен AST-based `scripts/plugin-source-audit.mjs`, но полный граф актуального checkout не перестроен. Поэтому 0 cycles/0 forbidden edges для этой ревизии не заявляются. Computed imports также не входят в статическое доказательство.

Просмотрены sanitizer/Raw, JSON ownership, package exports и build pipeline. Новая эксплуатация XSS не заявляется; отсутствие XSS/CVE также не доказано. Полный security corpus, pinned dependency audit, TypeScript 5.9.3, tarball consumer и CSS asset checks не запускались.

Инвентарь содержит 21 block factory, 12 default inline tools, 21 renderer. Это не доказательство поведения каждого типа. Старый API/JSON compatibility намеренно вне нормативной цели v2; возвращать migrations/aliases ради формального совпадения с v1 не следует.

## Приёмка и пределы

Обязательно закрыть R1/R2 интеграционными red/green тестами, затем R3 и contract no-op A2. После этого измерять/устранять A1 на целевых размерах, сохраняя fuzz invariants.

Полный проверочный gate на исправленном SHA:

```bash
npm ci
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Дополнительно нужна v1/v2 differential matrix видимого документа, caret/selection, количества блоков, history, inline sidecars и runtime sessions для всех 21 блоков/12 инструментов. Не смешивать осознанный API/wire break с пользовательской регрессией. OS IME, Firefox/WebKit, внешние providers и длительный heap test остаются неподтверждёнными.

**Статус:** архитектурная основа пригодна для дальнейшей работы; обнаруженные пользовательские расхождения и неполная приёмочная матрица не позволяют объявить библиотеку завершённой или релизно готовой.
