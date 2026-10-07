# Rector v2 — повторная проверка необходимости архитектурного рефакторинга

Дата: **07.10.2026**, Europe/Kaliningrad. Репозиторий: `Shelamkoff/editor`, ветка `refactor/rector-v2-architecture`. Исходный код проверен на **`98d5233e43e242d618670e2104da95d79f1a559f`**. Повторно проверены опубликованные отчёт и спецификация из **`19ee1383c42511bf9d85c4854791f2c679fb1247`** и **`05735fae7ce0c63a29f6edaed4e858c54e87b017`**; после исходного commit менялись только два архитектурных документа. Результаты второго прохода приведены в разделе 7, третьего — в разделе 8.

## Вывод

**Ограниченный архитектурный рефакторинг нужен.** Его основания — воспроизводимые нарушения целостности подготовленных операций, потеря данных на границе частичной DOM-проекции, небезопасная для reentry публикация validation observer, неполный публичный контракт inline-плагинов и ошибки владения ресурсами. Размер файлов помогает найти сложные участки, но не является критерием необходимости или завершения работы.

**Существующую основу v2 следует сохранить:** `DocumentStore`/draft, `TransactionEngine`, `HistoryStore`, `CanonicalTransforms`, общие current-format схемы, `BlockReconciler`, logical selection и revocable scopes. Проверка не дала оснований для замены модели документа, нового движка истории, общего command bus, нового text engine или отдельного MediaManager.

Подготовлена и повторно уточнена [спецификация архитектурного этапа](RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md). Повторный проход подтвердил исходный вывод и выявил пробелы в описании подготовки, логических результатов, выделения и native Mention; они исправлены в нормативных контрактах и приёмке. Спецификация имеет статус `implementation-ready`: необходимые решения о владельцах, контрактах, отказах, сохранении поведения и замене старых путей определены. Это готовность спецификации к реализации, а не заявление об исправлении описанных дефектов или готовности библиотеки к выпуску.

## 1. Источники и границы этой проверки

Сопоставлены оба приложенных документа:

- `Вставленный Markdown(1).md` — предыдущая оценка необходимости рефакторинга с привязкой к `98d5233`.
- `Вставленный Markdown (2).md` — локальный аудит с заявленными исправлениями Mention, Poll и скрытых полей, итогами 563 Node-тестов и 1844 native cases. Сам документ указывает, что изменения остались локальными, без commit/push.

На момент первого прохода HEAD ветки был `98d5233`. В этом checkout отсутствуют `tests/browser/native-audit-edges.js`, `native-audit-poll.js`, `native-audit-hidden-fields.js` и `test-results/audit-2026-10-07/*`, на которые ссылается второй файл. Код соответствующих исправлений также отсутствует в проверенных местах. Поэтому заявленные локальные результаты **не перенесены** на опубликованный HEAD и не засчитаны как свежая проверка.

Изучены актуальная [спецификация исправлений](RECTOR_V2_REMEDIATION_SPEC.md), существующие матрицы/отчёты, исходники, типы, регистрация расширений, вызывающий код, тесты и механизм генерации declarations. Учтены проектные skills [TDD](.agents/skills/tdd/SKILL.md) и [modern JavaScript](.agents/skills/modern-javascript-patterns/SKILL.md). Для новой спецификации применён `implementation-specification`: нормативное целевое состояние отделено от плана реализации; решения проверены по исходникам; добавлены impact/replacement maps и доказательства приёмки.

Все ссылки на строки исходников ниже закреплены на проверенном commit. Штатные проверки и небольшие диагностические воспроизведения запускались без изменения production-кода, тестов или конфигурации. Диагностические адаптеры DOM/реестра в Node не выдаются за браузерные пользовательские сценарии.

## 2. Что подтвердилось в приложенной оценке

| Замечание | Повторная оценка | Необходимое действие |
|---|---|---|
| `DocumentRuntime` объединяет слишком много решений | Подтверждено; дополнительно воспроизведена потеря ранее подготовленного изменения из-за чтения committed state | Выделить подготовку clipboard/conversion; читать текущий draft; runtime оставить координатором |
| Не выделен `DocumentIngestion` | Подтверждено, но самостоятельный метод небольшой; существенны observer и диагностика | Небольшой модуль подготовки без observers, с общим decoder |
| Скрытые поля и inline sidecars теряются | Подтверждено на реальном serializer с настоящими схемами | Общий контракт частичной проекции и подсчёт ссылок по всему результату |
| `InlineWidgetContext` не объявляет используемый метод | Подтверждено типизированным consumer probe | Объявить/описать scoped `commitDomMutation`, исключить случайные члены контекста |
| В tools и core различная адресация выделения | Подтверждено; ошибочность каждого текущего форматирования не утверждается | Один strict selection port с `fieldKey`, непрозрачным bookmark и правилами актуальности |
| Cleanup highlights может удалить чужой ресурс | Воспроизведено | Проверять identity принадлежащего controller объекта; tools не пишут в реестр |
| Cleanup toolbar обрывается при исключениях | Воспроизведено для destroy и неудачного mount | Независимая очистка каждого приобретённого ресурса и освобождение claims |
| Core знает семантику Heading ID | Подтверждено | Декларативный `compactLabel`, непрозрачные action IDs |
| Mention повторяет правила изменения подписи | Подтверждено; фильтры word/line и локальный clipboard также неполны | Одна функция решения изменения подписи, отдельные event adapters |
| Carousel необходимо существенно переработать | Доказательств для значительной переработки нет | Сохранить одного владельца экземпляра; settings/source helpers — необязательная локальная декомпозиция |

Числа строк в приложениях нужно читать с учётом версии и способа подсчёта. В опубликованном исходнике 3059 логических строк `DocumentRuntime`, 984 `utils.js`, 930 `InlineToolbar`, **859 Mention**, 882 Carousel. Значение 904 для Mention относится к другой, локально изменённой версии. У файлов без завершающего перевода строки `wc -l` показывает на единицу меньше. Эти различия не влияют на архитектурный вывод.

## 3. Подтверждённые дефекты и архитектурные причины

### A1. Частичная проекция считается полным источником rich text и inline-ссылок

**Важность: высокая — сохранность данных. Доказательство: реальный serializer, контролируемые входы.**

`InlineProjectionRuntime.serializeBlock()` собирает `counts` только при обходе смонтированных rich-text полей. Затем он заменяет только видимые значения в `readData`, а остальные принимает из полной локальной копии плагина. Источником surviving sidecar становится неполный набор ссылок. [Сериализация](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineProjectionRuntime.js#L132-L175).

Два воспроизведения с реальным методом и схемами:

1. Carousel: скрытая подпись `hidden {{w}}` остаётся в `data`, но присутствовавший во входном record `inline.w` исчезает; результат `inline === undefined`.
2. Person: committed имя `{{w}}` при отсутствии mounted-поля заменяется старой строкой `<span>@Ada</span>` из `readData`, sidecar также исчезает.

У Person `syncVisible()` записывает raw `innerHTML` в локальную копию, а `read()` снова вызывает эту синхронизацию. У Poll `focusout` передаёт raw HTML вопроса/вариантов в `updateData()`. Это именно опубликованный код; исправления из локального аудита здесь отсутствуют. [Person](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/plugins/person/index.js#L135-L150), [Person read/update](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/plugins/person/index.js#L486-L529), [Poll](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/plugins/poll/index.js#L358-L369).

**Минимальное решение:** candidate определяет структуру; mounted-поле сериализуется; existing hidden-поле берётся из committed record; новое hidden-поле сохраняет candidate value; действительно удалённое поле не возвращается. Ссылки считаются по всему результату. Эта политика применяется только к DOM sync — model-first обновление должно продолжать намеренно менять скрытые данные.

Найдено и расхождение grammar: `collectTokens()` сканирует raw HTML регулярным выражением, тогда как канонический scanner читает текстовые узлы. Ссылка в атрибуте HTML не должна считаться inline occurrence. Следует расширить существующий scanner occurrence counts, сохранив различие own references/literals. Это статически подтверждённое несоответствие; отдельный native-сценарий с атрибутом в этом проходе не выполнялся. [Raw scan](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineProjectionRuntime.js#L17-L20), [каноническое сканирование](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/shared/richTextOperations.js#L205-L234).

Не нужен новый projection manager: реальная точка сборки — [BlockReconciler.readBlock](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/BlockReconciler.js#L178-L191). Файла `DocumentProjection.js` в этой архитектуре нет.

### A2. Validation observer допускает выполнение вложенного producer

**Важность: высокая для границы эффектов. Доказательство: исполнение настоящего runtime.**

`render()` вызывает `#ingest()` внутри `engine.execute()`. Decoder failure немедленно вызывает observer. В этот момент engine имеет фазу `building`, в которой host-операции разрешают вложенный вызов. [render](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L845-L851), [ingest](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L2091-L2101), [observer](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L2160-L2173), [authority check](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L2905-L2912).

Воспроизведение: `render({version: '99.0.0', blocks: []})`; callback ошибки вызывает `runtime.update('a', producer, 'host')`.

| Наблюдение | Результат |
|---|---|
| Вызов validation observer | 1 |
| Вызов вложенного producer | **1 — запрещённый эффект произошёл** |
| Вложенный update | Вернулся без ошибки |
| Внешний render | `RangeError` |
| Committed текст / revision / canUndo | Сохранены: `Before` / `0` / `false` |

В этом сценарии **не доказана порча committed model**: engine правильно отбросил draft. Доказан запуск пользовательского кода в момент, когда его эффекты должны быть запрещены. Тест containment исключений observer не проверяет такой reentry.

**Решение:** ingestion подготавливает данные без уведомлений; runtime уведомляет после выхода из неудачной подготовки под отдельным guard. Guard должен учитывать и host-операции, и фазу, которую видят `InstanceScope`, а также вложенный render в ещё разворачивающемся внешнем draft. Одного переноса вызова за пределы функции недостаточно.

### A3. Validation reason зависит от текста исключения

**Важность: средняя; дефект внешнего диагностического контракта. Доказательство: воспроизведение ложной классификации.**

`issueReason()` использует `/document version/i` и `/data version/i`. Пользовательская схема с актуальным `dataVersion: 1`, бросающая `RangeError('Plugin data version content constraint')`, приводит к `unsupported-data-version`, хотя несовпадения версии не было. [Классификатор](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L47-L51).

**Решение:** shared boundary помечает причину структурированно в момент отказа. Native shape/version ошибки сохраняют `TypeError`/`RangeError`; ошибка callback схемы классифицируется как `invalid-data` независимо от её текста. При передаче issue не повторно читать input getters и не раскрывать содержимое документа. Существующий decoder остаётся общим для editor/renderer/clipboard.

### A4. Подготовленный clipboard-план не имеет достаточной принадлежности и актуальности

**Важность: высокая для целостности внутреннего контракта. Доказательство: три исполнения настоящих подготовленных планов.**

Внешний объект plan заморожен поверхностно; nested-массивы и часть данных остаются изменяемыми. Проверка применения проверяет только совпадение committed `generation` и `revision`. [Создание plan](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L1062-L1162), [проверка](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L2177-L2182).

Воспроизведения используют реальный результат `prepareLogicalClipboardSlice(null, ['a'])`:

- План runtime A принят runtime B с теми же ID и счётчиками, после чего B удаляет свой блок `a`.
- План принят после изменения затронутого блока в той же building-транзакции, поскольку committed revision ещё не поменялся; новое staged-содержимое удалено.
- `Object.isFrozen(plan) === true`, но `Object.isFrozen(plan.blocks) === false`. Добавленное в массив удаление невыделенного `b` выполняется вместе с удалением `a`.

Действующий `ClipboardController` получает план от собственного runtime и сам такие подмены не делает. **Внешний exploit или обычная пользовательская последовательность для чужого plan не заявляется.** Однако это доказанный неполный контракт внутренней подготовки; переносить его как устойчивое API нового модуля нельзя.

**Решение:** issuer-bound handle с private prepared state; наружу только отделённые read-only данные для transfer. Перед применением проверять принадлежность, generation/revision, ID order и immutable references прочитанных/затронутых записей текущего draft. Это не требует новой версии draft или хеширования документа: неизменённые записи уже разделяют immutable references с store. [DocumentDraft](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentStore.js#L63-L128), [обновление record](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentStore.js#L157-L170).

### A5. Планирование по committed state теряет предыдущее изменение в том же draft

**Важность: высокая для композиции команд. Доказательство: внутренний runtime-сценарий.**

Начальное состояние — пустой paragraph `a`. В одном `runtime.interact()` сначала выполняется `update('a', ...)` с текстом `Authored earlier in same draft`, затем `insertClipboardParts()` со вторым блочным fragment `Pasted`.

Фактический результат — только `["Pasted"]` с ID `a`. Вставка проверяет пустоту по старому committed record и заменяет anchor, хотя он уже заполнен в действующем draft. Правильный результат — сохранённый авторский anchor и следующий вставленный блок. Revision становится 1, Undo восстанавливает исходное состояние: проблема в источнике планирования, а не в механизме фиксации. [isEmpty](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L462-L466), [insertClipboardParts](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L1322-L1395).

Текущий built-in paste wrapper обычно выполняет paste как единственную вложенную команду. Поэтому это **не заявление о потере текста при любом обычном Paste**. Это доказательство несогласованности внутренних команд с уже поддерживаемой композицией `TransactionEngine`. [Общий building draft](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/TransactionEngine.js#L101-L145).

**Решение:** подготовка немедленной операции читает snapshot актуального draft. Достаточно вывести существующие `DocumentDraft.ids()/peek()` во внутренний transaction context. Runtime применяет готовый список канонических edits в той же транзакции; planner не открывает свою историю.

### A6. Публичный InlineWidgetContext не соответствует использованию встроенного расширения

**Важность: средняя/высокая для внешних расширений. Доказательство: TypeScript consumer.**

Контракт не содержит `commitDomMutation()`, runtime его предоставляет, Mention использует в шести местах. Минимальный типизированный внешний consumer получает `TS2339: Property 'commitDomMutation' does not exist on type 'InlineWidgetContext<...>'`. [Тип](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/plugin-kit/types.d.ts#L296-L308), [runtime](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L3038-L3054).

Общая authority factory также случайно добавляет inline-контексту `createId()`. Потребителей этой возможности в inline-плагинах не найдено. Объявлять все случайно попавшие методы было бы необоснованным расширением API.

**Решение:** явно конструировать поддерживаемый inline-контекст, объявить и документировать нужный scoped DOM method, убрать случайный allocator из этой поверхности. Уточнить синхронность/thenable, read-only/revocation, recovery и границу owning block. Операция не является sandbox для произвольного JS: ограничение edits своим field — обязанность плагина; canonical synchronization технически выполняется для блока.

### A7. У выделения два способа адресации и несколько владельцев восстановления

**Важность: архитектурная, особенно для динамических полей. Доказательство: source/consumer tracing.**

Core работает с `blockId + fieldKey + offset`, а `inline-tools/utils.js` сохраняет `fieldIndex`, местами DOM-узлы, и восстанавливает по DOM-порядку. Публичный port содержит только `range/activate/deactivate`, поэтому tools самостоятельно восполняют отсутствующий контракт. [Indexed bookmarks](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/inline-tools/utils.js#L600-L688), [port](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/inline-tools/types.d.ts#L11-L16), [fieldKey resolution](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/SelectionController.js#L528-L573).

**Решение:** strict per-mount selection port, непрозрачный bookmark с logical endpoints и правилами актуальности. Нужен явный результат изменения длины: `caseTransform` сейчас корректирует конечный offset при расширении Unicode, например `ß → SS`. Этот функционал нельзя потерять, просто скрыв offsets за opaque token.

Особое ограничение: `LogicalSelection` намеренно допускает fallback к первому полю и раскрытие скрытого editing host при history recovery. Такой fallback не подходит для просроченного форматирования, которое должно вернуть отказ без focus/model effects. Эти два контракта нужно различить, сохранив одного логического владельца. [History restoration](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/LogicalSelection.js#L63-L129), [fallback](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/LogicalSelection.js#L169-L184).

### A8. Cleanup CSS Highlights удаляет ресурс другого controller

**Важность: средняя; владение визуальным ресурсом. Доказательство: реальный `SelectionController.destroy()` с контролируемым registry.**

Controller использует document-global ключ `oe-cross-select-v2` и безусловно удаляет его при clear/destroy. Tools также работают с этим ключом. В воспроизведении до `A.destroy()` запись B присутствовала, после — исчезла. Это доказывает удаление чужой подсветки, но не потерю logical selection B. [Cleanup](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/SelectionController.js#L410-L423), [регистрация/удаление](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/SelectionController.js#L616-L624).

**Решение:** controller хранит identity своего `Highlight` и удаляет запись только при совпадении. Tools полностью передают presentation существующему selection owner. Новый глобальный manager или отдельные динамические CSS-правила для каждого редактора не нужны для исправления данного дефекта. Документная область registry подтверждается [CSS Custom Highlight API §3.2](https://drafts.csswg.org/css-highlight-api-1/#registering-highlights); это актуальный рабочий проект спецификации.

### A9. Исключение extension hook останавливает cleanup toolbar

**Важность: средняя/высокая; утечки ресурсов и удержание ownership. Доказательство: реальный toolbar с узким DOM-адаптером.**

При исключении `destroy()` первого инструмента второй не получает ни unbind, ни destroy. Его повторный mount завершается `Inline tool instance is already mounted: second`. При исключении `onMount()` второго инструмента не вызывается destroy ни уже смонтированного первого, ни начавшего инициализацию второго. [Constructor cleanup](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineToolbar.js#L201-L254), [destroy](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineToolbar.js#L406-L424).

Родительский `LifecycleScope` может удалить root DOM, но не знает о таймерах, обработчиках и других ресурсах, приобретённых внутри незавершившегося tool hook. Поэтому удаления root недостаточно.

**Решение:** небольшой ledger приобретённых ресурсов; отмечать начало hook до его вызова, отзывать порт, независимо unbind/destroy каждого инструмента, освобождать claim в `finally`, продолжать очистку при ошибке. Сохранить исходную ошибку mount и idempotent teardown. Новая трёхуровневая иерархия definitions/runtime/instances для tools этим дефектом не обоснована.

### A10. Generic toolbar интерпретирует Heading action IDs

**Важность: средняя; скрытая связность extension/core. Доказательство: source tracing.**

Regex `h2`–`h6` определяет compact label и `dataset.level`. Следовательно, действие стороннего плагина с таким ID получает постороннюю семантику. [Toolbar](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineToolbar.js#L748-L803).

**Решение:** optional `compactLabel` в существующем `SettingsAction`, full label для меню и fallback, Heading сам задаёт компактные подписи. Generic `data-action-id` заменяет вывод уровня из ID. Production CSS не зависит от этого `data-level`; соответствующие test/docs selectors нужно перевести вместе с изменением контракта. [Action contract](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/plugin-kit/types.d.ts#L401-L415).

### A11. Mention повторяет text-decision logic и имеет отсутствующие пути из локального аудита

**Важность: высокая для редактирования подписи; архитектурный долг подтверждён.**

В `editing.handle()` и runtime beforeinput повторяются обработка trigger, классификация update/remove/unwrap и Unicode boundaries. Word/soft-line input types отфильтровываются и здесь, и в `InlineWidgetInputController`. При одинаковом допустимом deletion range реальная capability вернула update для `deleteContentBackward`, но `null` для `deleteWordBackward`, `deleteWordForward` и `deleteSoftLineBackward`. [Capability](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/inline-plugins/mention/index.js#L60-L126), [DOM handler](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/inline-plugins/mention/index.js#L495-L660), [controller filter](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineWidgetInputController.js#L29-L47).

Локальных copy/cut/paste handlers в Mention нет; общая классификация target исключает widget-owned события из обычного editing host. Это согласуется с описанным в приложении дефектом, но реальные Chrome clipboard/word gestures в этом проходе не повторялись. [Target boundary](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/shared/editableFields.js#L82-L88).

**Решение:** одна чистая функция изменения подписи и небольшие адаптеры. Решение возвращает update/remove/plain text и caret; browser target ranges, event ownership, composition и search принадлежат существующему runtime. Сохранить прекращение поиска/идентичности при удалении trigger, native word semantics, локальный clipboard с отказом Cut при неудачной записи, окружающее структурное выделение и один Undo. Превращать все пути в атомарное удаление widget нельзя — это изменит функциональность.

## 4. Что сохранять и что не делать обязательной задачей

`TransactionEngine` уже владеет одной транзакцией, projection preparation, history preparation, фиксацией, восстановлением и replay. `CanonicalTransforms` уже решает общие assembly/remap/reference задачи. Shared schema уже задаёт current envelope и exact-version boundary. Декомпозиция должна использовать этих владельцев. [TransactionEngine](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/TransactionEngine.js#L129-L216), [CanonicalTransforms](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/CanonicalTransforms.js#L196-L239), [DocumentSchema](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/shared/DocumentSchema.js#L196-L239).

Сам `#ingest()` занимает около 35 строк. Полезно выделить его ответственность, но нет основания превращать её в сложную подсистему. Главное здесь — отсутствие effects во время подготовки и корректная диагностика.

Carousel уже использует scoped DataTask, view controller, состояние активного слайда и принадлежащий экземпляру timer. Settings/source UI можно вынести для удобства чтения, но это не основание создавать общего владельца media state. [Carousel](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/plugins/carousel/index.js#L337-L426).

Для toolbar достаточно исправить lifecycle/selection/action contracts, затем оценить остаточную сложность. Для utils оправдано разделение formatting, UI и factory responsibilities; файл на каждый короткий метод не нужен. Критерий завершения — единственный владелец каждого изменённого контракта и сохранённое поведение, а не произвольный лимит строк.

## 5. Фактически выполненные проверки первого прохода

Окружение первого прохода: Linux, Node **24.19.0**, npm **11.9.0**, TypeScript **5.9.3**; зависимости установлены из существующего lockfile без изменения отслеживаемых файлов.

| Проверка | Результат первого прохода | Что доказывает |
|---|---|---|
| Адресный Node baseline: runtime, engine, transforms, store, reconciler, registry, scopes, schema, observers | **107 PASS, 0 FAIL, 0 skipped** | Существующие проверяемые контракты затронутой основы |
| `npm run typecheck` | **PASS**, оба проекта | Текущую проверку JS/типов; не полноту публичного контекста |
| `npm run test:types` | **6 PASS**, Bundler/NodeNext consumers | Генерацию и текущие consumer fixtures |
| `npm run test:plugin-source` | **PASS** | Имеющиеся правила source audit |
| AST-граф runtime imports/exports и литеральных dynamic imports | **274 модуля, 671 связь, 0 cycles, 0 violations, 0 unresolved local JS imports** | Проверенные статические направления зависимостей |
| Validation reentry и неверный reason | Дефекты воспроизведены | A2/A3 |
| Три prepared-plan сценария и composed empty-anchor paste | Дефекты воспроизведены | A4/A5 на внутренней runtime-границе |
| Реальный serializer с Carousel/Person schema | Дефекты воспроизведены | A1 независимо от browser gesture |
| Типизированный inline consumer | Ожидаемый диагностический **TS2339** | A6; это отдельный probe, а не падение штатного `test:types` |
| Highlight cleanup, throwing destroy, throwing mount | Дефекты воспроизведены | A8/A9 с контролируемыми DOM/registry adapters |
| Mention editing capability | Word/line types возвращают `null` | Неполнота указанного capability path A11 |
| `git diff --check` до добавления документов | **PASS** | Отсутствие исходных whitespace changes |

Адресный Node baseline воспроизводится командой:

```sh
node --test core/DocumentRuntime.test.js core/TransactionEngine.test.js core/CanonicalTransforms.test.js core/DocumentStore.test.js core/BlockReconciler.test.js core/ExtensionRegistry.test.js core/InstanceScope.test.js core/LifecycleScope.test.js shared/DocumentSchema.test.js shared/invokeObserver.test.js shared/invokeObserver.thenable.test.js
```

Граф получен парсером TypeScript 5.9.3 для `index.js` и runtime `.js` без `.test.js` в `core`, `plugins`, `inline-plugins`, `inline-tools`, `plugin-kit`, `renderer`, `preset`, `shared`, `locale`. Проверены запреты extension → private core, renderer → editing и shared → runtime. Не анализировались произвольные вычисляемые import specifiers, передача полномочий через callbacks и runtime effects; именно поэтому нулевые графовые нарушения совместимы с A1–A11.

**В первом проходе не запускались** полный Node набор, native/Chrome/heap, полный package consumer/build, bundle gate, production docs/demo и v1 runtime. Доступный Chrome/Chromium в стандартных путях окружения не обнаружен. Здесь нет нового доказательства полного функционального паритета, системного IME или Firefox/WebKit. Эти ограничения не мешают сформулировать контракт и план, но браузерные критерии обязательно выполнить при реализации.

## 6. Содержание подготовленной спецификации

[RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md](RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md) задаёт:

1. Небольшую ingestion boundary и структурированную content-free диагностику с отдельным observer guard.
2. Общую merge-политику partial projection, различающую hidden/existing/new/deleted поля, и единую интерпретацию inline references.
3. Подготовку всех активных clipboard/range/conversion путей по актуальному draft под полным preparation guard, один список canonical edits, результаты из итогового порядка и общий session allocator.
4. Runtime-issued clipboard handles с private residuals, source/order checks и отказом без автоматического перепланирования удаления; успешный результат и перенос каретки при применимой вставке без изменения данных.
5. Публичный scoped inline DOM contract с явными sync/failure/revocation/recovery semantics.
6. Strict selection port с field keys, направлением и revision/generation/mount validity; исключение widget-local endpoints; сохранение length-changing formatting и ожидаемого native-представления после собственной операции.
7. Независимую очистку ресурсов toolbar, вызов cleanup hooks каждого начатого tool и принадлежность highlight по identity ресурса.
8. Декларативную presentation metadata для inline actions.
9. Общий Mention text-decision path, атомарное согласование native label/окружающего текста/sidecar/состояния экземпляра и before-selection metadata; распознавание устаревшего input; согласованный переход поиска; точное поведение отказов local clipboard.

План разделён на девять проверяемых slices с зависимостями. Superseded paths удаляются в том же согласованном изменении; новые и старые алгоритмы не остаются параллельно. Внешние consumers учитываются как класс пользователей публичного extension API; старые selection utility exports не объявлены «внутренними» только ради удобства рефакторинга.

Отдельная приёмка проверяет соответствие реализации нормативной архитектуре, удаление старых путей и consumer migration. Зелёные тесты без этой сверки не считаются доказательством завершения этапа.


## 7. Повторная проверка опубликованных документов

Повторный проход направлен на поиск пропущенных действующих путей и противоречий в проектируемом поведении. Проверен опубликованный draft `19ee1383` против того же production-кода `98d5233`. Ни одно из уточнений ниже не означает, что production уже исправлен. Оснований для расширения работ до замены архитектурной основы не появилось.

### B1. Guard должен начинаться до чтения входа и вызова источника ID

**Свежие воспроизведения на настоящем `DocumentRuntime`.** Getter `version` во входе `render()` вызвал вложенный update producer **один раз**, прежде чем render завершился `RangeError`. Committed текст остался `Before`, revision — `0`: подтверждён запрещённый вызов во время подготовки, а не порча committed state. Во втором сценарии переданный внутреннему runtime источник ID вызвал producer во время подготовки Paste; итогом стал только `Pasted`, revision `1`. Это внутренний параметр runtime, а не заявленная публичная опция `createEditor`. [Чтение accessors](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/shared/DocumentSchema.js#L99-L114), [host authority](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L2905-L2912), [источник ID](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/CanonicalTransforms.js#L14-L29).

В §3.3 спецификации guard теперь охватывает всю подготовку: входные свойства, schema/default/normalizer/capability и источник ID. Он заканчивается в `finally` до применения плана и уведомления observer. Частная аллокация разрешена, выданные ID не возвращаются; callback не получает права вложенной мутации. Обычные вложенные пользовательские команды сохраняются.

### B2. В первоначальном перечне не хватало действующих путей Paste

В одном `interact()` сначала заполнен пустой блок `a` текстом `Authored earlier`, затем вызван Paste. И `applyPasteResults`, и `insertLocalBlocks` оставили **только `Pasted` в `a`**, потеряв уже подготовленное изменение. Оба результата повторно получены на реальном runtime. В них решение о замене пустого блока читает committed state. [Первый путь](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L285-L359), [второй путь](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L362-L410), [действующие consumers](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/ClipboardController.js#L514-L514), [async results consumer](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/ClipboardController.js#L671-L672).

В §6.2 и slice 4 явно включены оба метода и общий `replaceLogicalRange`, которым пользуются clipboard, selection/composition и line-break input. Для общих range-расчётов определён один внутренний `LogicalRangePlans`; он не владеет состоянием или транзакцией. Async resolution остаётся у существующего controller. `insertExternalBlocks`, `exportRichTextFragment` и `replaceRichTextFragment` не имеют найденных production-consumers и назначены к удалению вместе с исключительно их helpers. [Общий range-метод](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L977-L1059).

### B3. Логический результат нельзя вычислять по committed store после вложенного применения

Подготовленный Cut удаляет `a` из `[a, b]`. После завершения документ равен `[b]` в обоих вариантах, однако результат различается:

| Вызов | `result.blockId` | Блок существует после операции |
|---|---|---|
| Самостоятельный `applyPreparedClipboardCut` | `b` | Да |
| Тот же вызов внутри `interact()` | **`a`** | **Нет** |

Дополнительно оба результата содержали старое `focus.blockId: 'a'`. Причина — чтение committed order до завершения внешней транзакции. В §6 теперь цель и focus рассчитываются из итогового порядка плана; самостоятельное и вложенное применение возвращают одинаковый допустимый результат. Этот probe относится к подготовленному runtime-command; действующий whole-block UI Cut имеет отдельный маршрут, поэтому вывод не распространяется на каждый пользовательский Cut. [Расчёт результата](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L1229-L1234), [вложенное применение](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/ClipboardController.js#L560-L566), [whole-block route](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/ClipboardController.js#L222-L258).

Исправлен и риск, который вносила сама спецификация: пустой список edits был приравнен к неприменимости Paste. При замене текста таким же текстом операция применима; ей нужен успешный логический результат, чтобы свернуть выделение. Документ и история остаются прежними, caret обрабатывает controller, поскольку engine пропускает `selectionAfter` у пустого draft. Это подтверждено по возвращаемым значениям и consumers; новый браузерный сценарий не выполнялся. [Успешный caret result](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L1404-L1429), [consumer](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/ClipboardController.js#L363-L369), [empty draft](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/TransactionEngine.js#L143-L145).

### B4. Generic formatting не может адресовать часть widget label

Реальные функции logical offset с узким DOM-fixture преобразовали выделение `Ali` внутри `@Alice` в одинаковые field-offsets **`3 → 3`** и восстановили каретку снаружи widget. Причина — намеренная атомарность widget на уровне поля. §8.1 теперь отклоняет любой generic formatting range с endpoint внутри принадлежащего widget DOM до такого преобразования. Границы в родительском контейнере и целый widget между внешними endpoints остаются допустимыми. Это уточнение области контракта, а не введение второй системы label-координат для toolbar. [Атомарные offsets](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/shared/textOffset.js#L88-L110), [восстановление](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/shared/textOffset.js#L131-L145), [проверка ownership](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineProjectionRuntime.js#L182-L190).

Отдельно уточнено распознавание собственного отложенного `selectionchange`. Сопоставлять нужно ожидаемое native-представление под текущей lease/revision: конвертация уже сохраняет логический диапазон и показывает свёрнутую каретку у его конца. Синхронного флага восстановления недостаточно, и равенство native endpoints полному bookmark здесь неверно. Существующий selection owner сохраняется. [Режим конвертации](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/conversionSelection.js#L12-L25), [его реализация](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/SelectionController.js#L187-L192), [Selection API: очередь/coalescing](https://w3c.github.io/selection-api/#scheduling-selectionchange-event).

### B5. Merge требует проверки ключей, а refs — окончательной нормализации

`richFieldMap` складывает значения в `Map` без проверки дубликата; `mapRichText` от сторонней схемы может незаметно подменить значение. В §5 добавлены уникальность и валидность committed/candidate/mounted keys, запрет одному element иметь два ключа и отказ для mounted rich field, отсутствующего в candidate. Built-in Person/Carousel/Poll уже проверяют ID коллекций; здесь не заявляется новый дефект дубликатов в этих схемах. [Map construction](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineProjectionRuntime.js#L23-L31), [schema wrapper](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/shared/snapshotDataSchema.js#L88-L95).

Полный candidate sidecar теперь явно сохраняется до schema/rich-text normalization; окончательный подсчёт и удаление неиспользуемых refs выполняются в существующей semantic assembly после неё. Иначе normalizer может создать ссылку на преждевременно удалённый payload или дубликат после предварительной проверки. Это порядок проектируемого исправления A1; отдельная ingestion-политика не меняется. [Текущий порядок assembly](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/CanonicalTransforms.js#L219-L235).

### B6. Сохранённый DOM-узел не гарантирует актуальность экземпляра Mention

Controlled probe на настоящем `InlineProjectionRuntime`, с подготовкой приватного состояния только в памяти и небольшим DOM-fixture, показал риск проектируемого native-пути: при сохранении owned node число `instance.update` было **0**, видимый текст — `@Alpha`, но `entry.data` и следующий edit target сохраняли `Alpha Beta`. После `setReadOnly(true)` вернулась подпись `@Alpha Beta`. Это не воспроизведение обычного текущего `updateData`: проверялся путь удержания source projection, который требуется новому native reconciliation. [Обычное обновление cache](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineProjectionRuntime.js#L418-L425), [retained path](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineProjectionRuntime.js#L439-L445), [Mention projection](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/inline-plugins/mention/index.js#L810-L826).

§§7 и 10 требуют у opted-in экземпляра captured synchronous `update`, согласуют его payload/cache/DOM **до commit** и включают ошибку обновления в recovery. Если normalization вернула прежние canonical данные, необходимый repair всё равно выполняется без фиктивной истории. `afterNativeEdit` остаётся transient-уведомлением, а не скрытым механизмом ремонта данных. Выделение внутри surviving label сохраняется отдельно от его атомарной field-позиции.

### B7. Устаревший native input нужно распознать после потери права на запись

В предыдущем тексте инвалидированный pending snapshot следовало удалить, но затем тот же текст требовал распознавать соответствующий input как stale. Это противоречие. Теперь один существующий envelope имеет состояния valid/invalid: изменение revision, read-only или lifetime отзывает право на решение, сохраняя минимальные данные для маршрутизации до следующего input. Совпавший stale input не попадает в generic persistence; cleanup касается только всё ещё принадлежащей операции проекции и не переносит старое выделение в successor. Новое beforeinput заменяет envelope; чужой input отдаётся своему владельцу. Это исправление контракта, а не результат нового браузерного прогона.

Уточнён и приоритет диапазонов: browser target range, затем текущее noncollapsed native selection в том же поле, затем допустимый collapsed character fallback. Пересечение label с соседним текстом нельзя терять при пустом `getTargetRanges()`. Missing-range word/line обработка остаётся защитным путём. При отсутствии native DOM change нельзя выдумывать input/completion. Основание event-предпосылок — [Input Events Level 2, WD 01.05.2026, §§6–7](https://www.w3.org/TR/2026/WD-input-events-2-20260501/).

### B8. Перед открытием поиска внутри label нужно завершить прежний fresh query

Controlled actual-class probe на `InlineTriggerController` воспроизвёл последовательность: активный поиск в обычном тексте → новый поиск `Al` внутри label → отложенный selectionchange старого запроса → cancellation, закрывающий новый поиск. Простого подавления очередного input refresh недостаточно. [Проверка и cancellation](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineTriggerController.js#L193-L216), [Mention cancellation](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/inline-plugins/mention/index.js#L844-L845).

§10 теперь передаёт ownership явно: сначала отменяет действительно существующий fresh query, затем уведомляет surviving labels и final-caret label без дубликатов. В notice добавлен `labelChanged`: неизменённая неактивная граница не должна самопроизвольно включать editing/search. Уведомление другой label не закрывает сессию final caret. Новый search manager не вводится; текущая логика обычного `@query`, composition и outside typing сохраняется. [Существующее outside typing](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/inline-plugins/mention/index.js#L637-L643).

### B9. Ошибка local clipboard не должна запускать native fallback

Уточнение §10.3: после доказанного label-local ownership отменить default нужно **до** операций clipboard, способных бросить исключение. Иначе обещанный отказ Cut без изменения данных несовместим с нативным удалением. Успех Cut требует точного readback и повторной проверки текущих occurrence/range. Пустой, отсутствующий, HTML-only или нечитаемый plain-text Paste — поглощённая локальная операция без изменения selection/model/history. Непустые пробелы остаются текстом. Foreign/defaultPrevented события не присваиваются Mention; structural clipboard сохраняет своего владельца.

Требование отмены custom clipboard action и различия synthetic/system events сверены с [Clipboard API and events, §§5.2, 6.1–6.3](https://www.w3.org/TR/clipboard-apis/). Успешный event readback не объявляется гарантией долговременной записи в OS clipboard. Здесь уточнён проектируемый отказ; системный clipboard повторно не проверялся.

### Проверки и готовность после уточнений

- Повторно исполнены **шесть runtime-сценариев** B1–B3: входной accessor, ID source, standalone/nested Cut и два пути Paste. Наблюдения получены на настоящих runtime/store/engine без изменения repository tests.
- Выполнены дополнительные узкие Node probes для atomic offsets, retained inline instance и trigger handoff. Они используют реальные проверяемые функции/классы с контролируемым окружением; native gesture, браузерный layout, OS clipboard и IME ими не доказаны.
- Нормативные контракты повторно сверены с исходниками и consumers по трём независимым направлениям: runtime/planning, selection/toolbar, projection/Mention. Материальные замечания перенесены в спецификацию, replacement map, acceptance matrix и соответствующие slices.
- Уточнены зависимости: native slice использует guard/observer из slice 2. Публичные declarations, consumers и RU/EN documentation меняются вместе со своим контрактом; финальный slice проверяет сходимость, а не откладывает миграцию.
- **107 Node PASS, оба typecheck и остальные штатные результаты раздела 5 относятся к первому проходу.** Во втором проходе эти наборы не перезапускались; production-код между проверенными commit не менялся. Полный browser/native/package/build gate и Chrome/OS IME по-прежнему не проверены.

Итог повторной проверки: ограниченный рефакторинг обоснован; опубликованная спецификация нуждалась в уточнении, и эти уточнения внесены. Статус `implementation-ready` относится к согласованному плану и целевым контрактам. Реализация и её обязательные браузерные доказательства остаются отдельной работой.


## 8. Третий проход: полнота действующих путей и границ вызова extensions

Удалённый HEAD повторно проверен на `05735fa`; production-код остаётся тем же `98d5233`. В этом проходе проверены соответствие нормативных требований реальным вызывающим методам и поведение до/после защищённого участка. Обнаружены пропущенные пути подготовки и вызовы, которые обходили предусмотренный guard. Новая модель документа или ещё один transaction/selection owner для исправления этих находок не нужны.

### 8.1. Whole-block deletion, whole-selection replacement и pattern Paste не были перечислены полностью

Действующий whole-block Cut проходит через `ClipboardController` → `SelectionController.removeWholeBlocks()` → `DocumentRuntime.removeBlocks()`. Последний выбирает removals/default по committed IDs, а controller отдельно вычисляет соседний focus target по тому же устаревшему порядку. `replaceWholeDocument()` также определяет позицию до получения актуального draft. Pattern-based Paste идёт через `InlineCommandController` к `replaceRichTextWithInlineSegments()`, который читает committed source/order. [Whole-block controller](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/SelectionController.js#L230-L274), [runtime deletion/replacement](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L672-L731), [pattern consumer](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineCommandController.js#L54-L139), [segment preparation](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/DocumentRuntime.js#L1606-L1781).

Свежие воспроизведения на настоящем runtime:

| Сценарий | Наблюдение | Требуемый результат |
|---|---|---|
| Из `[a,b]` удалить `a`, затем `removeBlocks([b])` самостоятельными вызовами | Один default block | Контрольный корректный результат |
| Те же команды внутри одного `interact()` | **Пустой документ `[]`**, revision 1 | Один default block |
| В одном action вставить `c`, затем удалить прежние `[a,b]` | **Лишний пустой блок перед `c`** | Только surviving `c` |
| Вставить `c` перед `[a,b]`, затем заменить выбранные `[a,b]` | **`[replacement,c]`** | `[c,replacement]` |
| Обновить `a` до `Authored earlier`, затем выполнить pattern Paste в offset 0 | **`{{generated-1}}a`**, staged текст потерян | Inline occurrence перед актуальным текстом |

Для двух последних случаев использован ограниченный text-only detached DOM fixture; для pattern route — минимальная schema/pattern fixture с типом `color`, а не встроенный Color package. Удаления дополнительно проверены без DOM. Это доказательства расчёта состояния и порядка, не native caret/clipboard.

В §6.2, replacement map и slice 4 включены все три пути. `removeBlocks` теперь должен возвращать окончательный target ID либо `false`, без неоднозначного `true`; controller использует этот результат. Default появляется только при действительно пустом итоговом документе. Whole-selection replacement сохраняет незатронутые блоки и gaps актуального draft, включая подтверждение composition. Pattern Paste сохраняет match precedence, multiline semantics, sidecars и логический результат.

### 8.2. Upstream preparation должна оставаться под тем же guard

Защита готового segments/import результата слишком поздняя: `fromMatch` вызывается до runtime operation; `ClipboardController` непосредственно запускает HTML-import, внутри которого выполняются `matchesRoot`, `importRoot`, conversion materialization и allocation. Эти вызовы теперь явно включены в §3.3 и §6.2. `HtmlImportRouter` остаётся чистым helper; runtime предоставляет captured target/private allocator. MIME I/O и async resolution сохраняют нынешних владельцев. [HTML consumers](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/ClipboardController.js#L408-L417), [второй consumer](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/ClipboardController.js#L490-L505), [HTML callbacks](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/HtmlImportRouter.js#L31-L105).

Уточнена политика `fromMatch`: `null` — отсутствие подходящего результата; исключение, thenable или недопустимый payload — отказ всей принадлежащей операции до edits. Controller обязан отменить native default в обработчике такого отказа и завершить маршрут. Текущий catch, превращающий исключение в отсутствие match, назначен к удалению. Действующий тип уже задаёт `D | null`; встроенный Color сам возвращает `null`, когда значение ему не подходит, поэтому этот нормальный путь сохраняется. [Контракт](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/plugin-kit/types.d.ts#L352-L355), [Color](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/inline-plugins/color.js#L47-L53).

### 8.3. Подготовка UI actions может изменить документ перед собственной ошибкой

Вызовы `actions()` и чтение label происходят из UI, вне document-planning guard. Четыре probes на настоящих `ExtensionRegistry`/`DocumentRuntime` проверили `inlineControls` и `settings`, каждый с исключением внутри `actions()` и внутри getter `label`. Во всех случаях вложенный producer выполнился **1 раз**, изменил текст на `Changed while preparing UI`, повысил revision до **1** и создал Undo; исходная ошибка также вышла наружу. Воспроизведён порядок вызова capability/чтения metadata, а не отрисовка toolbar. [Inline label/dropdown](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineToolbar.js#L748-L803), [settings actions](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/BlockToolbar.js#L497-L507).

В §3.3 появился один внутренний `prepareExtensionValue(operation)`, использующий уже выбранный runtime depth guard. §9.2 проводит через него полный вызов/snapshot/validation списка и labels; DOM получает захваченные значения после выхода из guard. Ошибка отзывает всю затронутую группу, сохраняя документ и остальные controls. Метод не добавляется в публичные editor/plugin/tool контексты.

### 8.4. Публичные focus/selection/destroy обходят проверку document command

`EditorBlocksApi.setCurrent/select/clearSelection/focus` и `EditorHandle.focus/destroy` идут непосредственно к view/selection/teardown owner. Поэтому одного `DocumentRuntime.#assertHostMutation()` недостаточно. [Публичные block controls](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/PublicEditorApi.js#L45-L89), [editor focus/destroy](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/PublicEditorApi.js#L153-L174).

Probe вызвал настоящие public API внутри защищённой `syncBlockFromProjection` operation. Обычный host update был отклонён, его producer не запустился; одновременно **все шесть public control methods** дошли до переданных adapters. Adapters только записывали факт вызова: здесь не заявляется реальное разрушение DOM или потеря браузерного выделения.

§3.3 теперь явно требует проверки на публичном входе до любого dispatch, включая lifecycle flags. Внутреннее восстановление текущего owner и cleanup сохраняются; редактор с failed health по-прежнему можно уничтожить после выхода из защищённой операции. Эти checks реализуются вместе с общей границей в slice 2, без глобального запрета собственных selection operations.

### 8.5. Непосредственный inline dispatcher и отмена поиска — отдельные места применения guards

Реальные `InlineWidgetInputController`/`DocumentRuntime` показали: `editing.handle()` выполнил host update, затем вернул `null`; producer запущен **1 раз**, revision стал **1**, `defaultPrevented` остался `false`. Capability вызывалась до `interact()`. В §10.2 теперь указана вся последовательность: доказать event/field/occurrence ownership; подготовить и проверить вход/результат под общим guard; различить `null` и отказ; отменить native default до применения либо при ошибке принадлежащего события. Собственный отложенный caret проверяет актуальность результата. [Непосредственный dispatcher](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineWidgetInputController.js#L29-L72).

Немедленная контролируемая обработка ограничена cancelable non-composition событиями. Правило сверено с [Input Events Level 2, WD 01.05.2026, §6.1.2 и §7](https://www.w3.org/TR/2026/WD-input-events-2-20260501/): `insertCompositionText` имеет собственный некэнселируемый поток. Существующий composition owner сохранён.

Второй probe проверил существующий `InlineTriggerController.#cancel`, который нужен новому post-native handoff. Через настоящий `refresh()` открыт query, затем вызван этот cancellation path через controller `setReadOnly(true)`. Callback успел сделать отдельный host update, повысить revision до **1** и бросить `cancel failed`; active query уже был очищен. Это проверка вызываемого метода, а не реализованного нового native-пути. [Cancellation](https://github.com/Shelamkoff/editor/blob/98d5233e43e242d618670e2104da95d79f1a559f/core/InlineTriggerController.js#L213-L217).

Новый handoff теперь сначала отзывает fresh-query authority, затем вызывает `onTriggerCancel` под observation guard с containment и независимо продолжает notices актуальных labels. Запрет касается синхронного повторного входа; guard не удерживается через await и не объявляется sandbox для произвольного позднего JavaScript расширения.

### Проверка сходимости третьего прохода

Выполнены **12 контролируемых сценариев**: пять planning routes, четыре metadata cases, два inline/cancellation cases и один public-control probe. Это свежие результаты данного прохода; один standalone removal — контрольный успешный вариант. Все исполнения завершились с exit 0, воспроизведя описанное исходное поведение. Production/tests/config репозитория не изменялись.

Новые нормативные решения перенесены в replacement map, acceptance matrix и slices 2/4/7/8. По selection bookmarks, formatting continuation, lifecycle cleanup, partial projection, native pending/update/no-op/recovery и private clipboard handles новых материальных противоречий в рассмотренных контрактах не выявлено. Не требуется дополнительный engine, долговечный журнал handles, отдельный selection store или новая иерархия managers.

Штатные **107 Node PASS и typecheck из раздела 5 не перезапускались**. Полный browser/native/IME/system clipboard и package/build acceptance по-прежнему должен подтвердить будущую реализацию. Статус `implementation-ready` относится к уточнённым контрактам и плану, а не к наличию исправленного production-кода.
