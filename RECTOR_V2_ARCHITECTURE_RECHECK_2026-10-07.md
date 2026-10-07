# Rector v2 — повторная проверка необходимости архитектурного рефакторинга

Дата: **07.10.2026**, Europe/Kaliningrad. Репозиторий: `Shelamkoff/editor`. Проверена ветка `refactor/rector-v2-architecture`, опубликованный исходный commit **`98d5233e43e242d618670e2104da95d79f1a559f`**.

## Вывод

**Ограниченный архитектурный рефакторинг нужен.** Его основания — воспроизводимые нарушения целостности подготовленных операций, потеря данных на границе частичной DOM-проекции, небезопасная для reentry публикация validation observer, неполный публичный контракт inline-плагинов и ошибки владения ресурсами. Размер файлов помогает найти сложные участки, но не является критерием необходимости или завершения работы.

**Существующую основу v2 следует сохранить:** `DocumentStore`/draft, `TransactionEngine`, `HistoryStore`, `CanonicalTransforms`, общие current-format схемы, `BlockReconciler`, logical selection и revocable scopes. Проверка не дала оснований для замены модели документа, нового движка истории, общего command bus, нового text engine или отдельного MediaManager.

Подготовлена [спецификация архитектурного этапа](RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md). Она имеет статус `implementation-ready`: необходимые решения о владельцах, контрактах, отказах, сохранении поведения и замене старых путей определены. Это готовность спецификации к реализации, а не заявление об исправлении описанных дефектов или готовности библиотеки к выпуску.

## 1. Источники и границы этой проверки

Сопоставлены оба приложенных документа:

- `Вставленный Markdown(1).md` — предыдущая оценка необходимости рефакторинга с привязкой к `98d5233`.
- `Вставленный Markdown (2).md` — локальный аудит с заявленными исправлениями Mention, Poll и скрытых полей, итогами 563 Node-тестов и 1844 native cases. Сам документ указывает, что изменения остались локальными, без commit/push.

Ветка по-прежнему содержала `98d5233`. В этом checkout отсутствуют `tests/browser/native-audit-edges.js`, `native-audit-poll.js`, `native-audit-hidden-fields.js` и `test-results/audit-2026-10-07/*`, на которые ссылается второй файл. Код соответствующих исправлений также отсутствует в проверенных местах. Поэтому заявленные локальные результаты **не перенесены** на опубликованный HEAD и не засчитаны как свежая проверка.

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

## 5. Фактически выполненные проверки

Окружение этого прохода: Linux, Node **24.19.0**, npm **11.9.0**, TypeScript **5.9.3**; зависимости установлены из существующего lockfile без изменения отслеживаемых файлов.

| Проверка | Результат этого прохода | Что доказывает |
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

**В этом проходе не запускались** полный Node набор, native/Chrome/heap, полный package consumer/build, bundle gate, production docs/demo и v1 runtime. Доступный Chrome/Chromium в стандартных путях окружения не обнаружен. Здесь нет нового доказательства полного функционального паритета, системного IME или Firefox/WebKit. Эти ограничения не мешают сформулировать контракт и план, но браузерные критерии обязательно выполнить при реализации.

## 6. Содержание подготовленной спецификации

[RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md](RECTOR_V2_ARCHITECTURE_REFINEMENT_SPEC.md) задаёт:

1. Небольшую ingestion boundary и структурированную content-free диагностику с отдельным observer guard.
2. Общую merge-политику partial projection, различающую hidden/existing/new/deleted поля, и единую интерпретацию inline references.
3. Подготовку clipboard/conversion по актуальному draft, один список canonical edits, один существующий engine и общий session allocator.
4. Runtime-issued clipboard handles с private residuals, source/order checks и отказом без автоматического перепланирования удаления.
5. Публичный scoped inline DOM contract с явными sync/failure/revocation/recovery semantics.
6. Strict selection port с field keys, направлением, revision/generation/mount validity и сохранением length-changing formatting после собственного commit.
7. Независимую очистку ресурсов toolbar, вызов cleanup hooks каждого начатого tool и принадлежность highlight по identity ресурса.
8. Декларативную presentation metadata для inline actions.
9. Общий Mention text-decision path, атомарное согласование native label/окружающего текста/sidecar и before-selection metadata через существующие контроллеры; сохранение caret, trigger/search, composition и local clipboard.

План разделён на девять проверяемых slices с зависимостями. Superseded paths удаляются в том же согласованном изменении; новые и старые алгоритмы не остаются параллельно. Внешние consumers учитываются как класс пользователей публичного extension API; старые selection utility exports не объявлены «внутренними» только ради удобства рефакторинга.

Отдельная приёмка проверяет соответствие реализации нормативной архитектуре, удаление старых путей и consumer migration. Зелёные тесты без этой сверки не считаются доказательством завершения этапа.
