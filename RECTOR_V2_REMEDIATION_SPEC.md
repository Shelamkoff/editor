# Rector v2 — спецификация исправления архитектуры и поведенческих регрессий

**Готовность:** `implementation-ready` для разработки; не подтверждение готовности к выпуску.

## 1. Цель, основания и границы

Устранить подтверждённые потери данных и нарушения согласованности v2, завершить подключение межполевого форматирования и закрепить поведенческий паритет с v1. Итог — один канонический editing runtime, в котором преобразования сохраняют содержимое, документ/проекция/история согласованы, расширения имеют явное владение ресурсами, а UI использует те же проверяемые контракты, что публичные команды.

Основание: [аудит и повторная проверка R1–R12](RECTOR_V2_AUDIT_RECHECK_2026-10-03.md). Исходники повторно проверены на `6bd93c5598981e92b2f7fc8142708dc729918990`; база сравнения пользовательских сценариев v1 — `62038cefd8817a849c1a476a8c076b6bf535670b`. Подтверждены прежние 13 нарушений инвариантов и две дополнительные clipboard-проверки. Штатные 380 тестов проходят; typecheck и docs gate падают; browser/package/size gate текущего CI проходят. Причины и ограничения доказательств находятся в аудите.

Разделы 2–11 нормативны: определяют конечное устройство и поведение. Разделы 12–15 задают производные изменения, порядок реализации и доказательства. Если реализация требует изменить существенный контракт, сначала исправляется его нормативное определение, а не добавляется новая семантика внутри этапа.

[Исходная спецификация рефакторинга](RECTOR_V2_REFACTOR_PLAN.md) сохраняет силу для незатронутых инвариантов. Для перечисленных здесь состояний, projection protocol, clipboard, событий, extension contexts и selection-mutation этот документ является уточняющей заменой соответствующих контрактов; нельзя одновременно реализовывать противоречащие варианты из двух планов.

### Сохранить

- **P1.** Все 21 существующий block type, 12 default inline tools, inline widgets, renderer, lazy presets, настройки и поддерживаемые медиа-интеграции. Список типов берётся из действующих registries, не дублируется новым production-реестром.
- **P2.** Чтение уже поддерживаемых v1/v2 документов, текущие миграции, strict/preserve policy и инертное сохранение неизвестных блоков/inline payload. Сериализованный формат документа не меняется ради устранения этих дефектов.
- **P3.** Общие объекты схем editor/renderer; renderer не импортирует editing runtime. Save получает данные только из committed model. Изменение одного блока, move и обычное переключение readOnly не пересоздают незатронутые instances.
- **P4.** Нативный ввод, IME, logical selection и физический undo/redo; native input не зависит от change debounce. Одна пользовательская составная операция создаёт одну history entry; observer failure не отменяет committed state.
- **P5.** Владение ownerDocument/ownerWindow, действующая sanitization/URL/Trusted Types policy, отмена async upload/trigger/paste, отсутствие доступа расширений к mutable core managers.

### Не делать

Не добавлять CRDT/OT, новый text engine, framework wrappers, backend persistence, второй history/keyboard/editor runtime, v1 plugin adapter или постоянные compatibility aliases. Не менять transport внешних медиа-провайдеров без выявленной необходимости. Не заменять исправление отключением тестов/typecheck, расширением `any` или повышением size budgets.

**Breaking changes разрешены только в изменяемых контрактах.** В одной поставке переводятся встроенные реализации, публичные объявления типов, примеры и документация. Старые несовместимые варианты API удаляются. Это не разрешение терять текст, форматирование, opaque payload или невыделенные части документа.

## 2. Инварианты результата

| ID | Проверяемое требование |
|---|---|
| I1 | Любой transform переносит rich-text и связанную inline-таблицу совместно; литеральные токены не становятся ссылками вследствие коллизии. |
| I2 | После команды и в каждом post-commit observer документ, mode, effective readOnly, история и проекция относятся к одному committed состоянию. |
| I3 | Failed preparation не меняет модель/историю; failed application восстанавливает последнюю committed проекцию либо переводит runtime в явно неработоспособное состояние. |
| I4 | Разрушительный Cut не удаляет содержимое при обнаруженной невозможности записать достаточное представление; Paste сначала валидирует всё заменяемое содержимое и фиксирует его одной транзакцией. |
| I5 | Local/current данные никогда не направляются в legacy decode по отсутствующей версии; external payload никогда не получает доверие local input. |
| I6 | Событие обрабатывает его фактический владелец. Auxiliary native input сохраняет native history/clipboard; вложенный control не наследует полномочия окружающего поля. |
| I7 | Revoked context не вызывает producer, не изменяет DOM/модель, не получает полномочия нового instance с тем же ID. Каждый приобретённый ресурс имеет одного владельца и освобождается ровно один раз. |
| I8 | Форматирование всех выбранных совместимых rich-text полей действительно доступно из собранного editor UI и создаёт одну отменяемую операцию. Alignment существует только в block tunes. |
| I9 | Drag использует конечное положение без off-by-one; любое завершение жеста освобождает document listeners и временные UI-ресурсы. |
| I10 | ID-only query paths не клонируют и не обходят data/inline незатронутых блоков. Внешние snapshots остаются отделёнными от модели. |
| I11 | Configured definitions/schema members фиксируются до setup; обязательные контракты проверяются до live mutation; локализация проходит через существующие namespace словарей. |
| I12 | Приёмка покрывает исходный пользовательский сценарий, реальные composition paths и failure paths; вызов внутреннего метода или равенство имён экспортов не заменяет поведенческое доказательство. |

## 3. Конечные границы модулей

Не вводить универсальный command bus или репозитории поверх существующего DocumentStore. Выделить только ответственности, смешение которых стало причиной замечаний.

| Владелец | Ответственность и граница | Зависимости |
|---|---|---|
| `DocumentRuntime` | Узкий внутренний фасад команд/запросов, host-vs-interaction authority, health и composition document-компонентов. Не содержит MIME parser, switch по встроенным типам или алгоритмы каждой разновидности конвертации. | Ingestion, CanonicalTransforms, DocumentStore, TransactionEngine, registry ports. |
| `DocumentStore` / draft | Committed document records, order, document mode и preserved time; неизменяемые internal reads и отделённые external snapshots. Не владеет DOM, clipboard или plugin setup. | JSON ownership utilities, нейтральные типы. |
| `TransactionEngine` / `HistoryStore` | Единственный lifecycle подготовки, commit/replay/reset, согласованная публикация. История хранит committed changes, не сериализует DOM. | Store, prepared projection port, logical selection, diagnostic sink. |
| `DocumentIngestion` — выделяемая ответственность | Внешний document envelope, version chain, validation/preserve и подготовка полностью нормализованного кандидата. Никаких live mutations или events во время подготовки. | Shared schemas, registry read port, rich-text policy. |
| `CanonicalTransforms` — выделяемая ответственность | Сборка записей после преобразования, rich-text/inline transfer, remap/collision rules, residual selection data. Не владеет history или mounted instances. | Shared rich-text operations и чистые capabilities. |
| `BlockReconciler` / `InlineProjectionRuntime` | Staged/applied projections, instance scopes и DOM ownership. Получают будущую activation policy явно, не читают старый mode через closure. | Registry runtimes, candidate query port, LifecycleScope. |
| Clipboard codec/import | Выбранный модельный фрагмент, wire validation и полный план вставки. DOM event adapter только читает/пишет transfer formats и вызывает документную команду. | CanonicalTransforms, registry capabilities, shared sanitizer. |
| Interaction ownership / selection | Классификация event target; logical selection и projection selection port. Не принимает решений об истории через events. | Reconciler field ownership, popup/UI ownership. |
| Keyboard/toolbar/drag/native input | Адаптеры жестов к узким mutation/query ports. Не координируют несколько самостоятельных транзакций для одного жеста. | DocumentRuntime, ownership/selection ports. |
| `ExtensionRegistry` | Snapshot/validate definitions, setup runtime, per-editor localization и styles ownership. | Public plugin-kit contracts, LifecycleScope, shared schema utilities. |

Имена новых файлов приведены в §12 как предлагаемые расположения. Существующие pure helpers следует переносить/объединять, а не переписывать рядом со старой реализацией. У `DocumentRuntime` может оставаться несколько делегирующих методов ради узкого seam; разбиение по одной операции на класс не требуется.

Направление зависимостей:

```text
createEditorRuntime -> public facade + interaction adapters
interaction adapters -> document command/query ports
DocumentRuntime -> ingestion + canonical transforms + transaction/store/history
transaction -> prepared projection port
reconciler -> registry runtime + scoped context
plugins/inline tools -> plugin-kit/shared contracts, не private core
renderer -> shared schemas/policies + renderer-owned instances, не editor runtime
```

## 4. C1 — состояние, commit и проекция

### 4.1. Каноническое состояние и полномочия

У committed document state единый владелец — DocumentStore:

```ts
type DocumentMode = 'editable' | 'preserved'
interface DocumentMetadata {
  version: string
  mode: DocumentMode
  preservedTime?: number
}
// records/order остаются существующими неизменяемыми структурами Store.
// Отсутствующий preservedTime не заменяется текущим временем.
```

`requestedReadOnly` — control state DocumentRuntime, не сериализуемое поле и не часть history. `effectiveReadOnly = requestedReadOnly || mode === 'preserved'`. DocumentRuntime также владеет `health: 'ready' | 'failed' | 'destroyed'`, поколением полного документа и монотонной ревизией committed переходов. Это внутренние значения, не новые поля сохранённого JSON и не producer `revision`.

Поколение документа меняется при успешной полной замене: render, clear, replay document.replace и reset. При move/data update поколение не меняется. Новая активация блока/виджета имеет отдельный mount token, поэтому удаление и последующее восстановление того же ID не восстанавливает старые полномочия. Неуспешная транзакция не публикует новое поколение. Ни поколение, ни mount token не откатываются к ранее выданной идентичности.

**Разделить host-authorized и interaction commands.** Public host API render/clear/blocks для поддерживаемого editable-mode документа может изменять данные при requestedReadOnly=true, как предусмотрено исходной спецификацией. Keyboard, clipboard, native input, toolbar и plugin contexts не могут. История пользователя undo/redo недоступна в effectiveReadOnly. В preserved mode `setReadOnly(false)` отклоняется без изменения requested flag; выйти из preserved можно только через host render поддерживаемого документа. Preserved mode запрещает любые persist mutations; исключение — явный host render нового документа. Нельзя закрывать эту разницу одним глобальным assertWritable, одинаковым для всех вызовов.

### 4.2. Таблица переходов

| Переход | История | Проекция и публикация |
|---|---|---|
| Первичная загрузка | Пустая | Полностью подготовить state до mount; onReady после успешной сборки. |
| Обычная составная edit-команда | Одна запись, кроме no-op | Только affected records; один committed event. |
| Supported render → supported | Одна document.replace запись | Новый document lifetime, в том числе при совпадающих block ID. |
| Editable ↔ preserved; preserved → preserved | Очистить undo/redo, не создавать history record | Reset использует будущие mode/time/activation; observers видят их после commit. |
| Clear в editable mode | Одна document.replace запись | Один default block; host authority сохраняется при requestedReadOnly. |
| Undo/redo | Переместить cursor только после успешного replay; новой записи нет | Проецировать фактически применённое направление changes. |
| setReadOnly | Не менять document/history и generation | In-place control transition; обновить все UI/task guards; только control/history-availability observations. |
| Failed prepare/apply | Не менять history/cursor/model | Восстановить committed projection/selection; committed event отсутствует. |

Сохранить текущую семантику save: editable output получает текущее `time`; preserved output сохраняет исходное значение/отсутствие time. Время выдачи save не участвует в равенстве документов для no-op/history. Событие изменения документов не возникает из одного вызова save.

### 4.3. Prepared projection protocol

Расширить существующий protocol, не добавляя второй reconciler:

```ts
interface PreparedProjection {
  apply(): void
  recover(): void
  finalize(): void
  discard(): void
}
```

- `prepare` принимает committed view, **candidate view с metadata**, affected changes и explicit activation policy. Он приобретает staged scopes, не публикует candidate как committed и не уничтожает предыдущих владельцев, необходимых для recovery.
- `apply` допускает plugin update/create и изменение DOM. До успешного окончания state/history не заменены. Mutations из plugin callbacks во время prepare/apply/recover запрещены до вызова их producer/DOM operation.
- Store state, future history record/cursor и значения event готовятся и валидируются **до commit point**. Сам commit point — синхронная замена заранее подготовленных внутренних значений без callbacks, schema calls или JSON validation. Не оставлять fallible history.push после необратимого store swap.
- `recover` восстанавливает последнюю committed проекцию и logical selection; если повреждённый affected instance нельзя восстановить update, допустима его замена. Нельзя пересоздавать все незатронутые блоки для обычного rollback.
- `discard` идемпотентно освобождает непереданные staged ресурсы; обязателен и при исключении до возврата полного prepare-result.
- После commit `finalize` освобождает superseded scopes. Его cleanup failures отправляются в diagnostics, остальные ресурсы всё равно освобождаются; commit не отменяется. Продолжать вызывать user mutation из dispose запрещено.
- После успешной фиксации и finalization публикуются observations. Ошибка одного listener не блокирует остальных; sync throw и rejected Promise изолируются через одну действующую observer utility. Event payload глубоко неизменяем либо отделён на границе; listener не может менять данные для следующего listener.

Если recovery не смогло вернуть согласованную проекцию, `health='failed'`: взаимодействия отключены, новые mutations/replay отклоняются, сохранять разрешено только последнюю committed модель, destroy остаётся доступным и идемпотентным. Диагностика не содержит текста документа/полных payload. Нельзя сбрасывать phase в обычный idle и продолжать редактирование неизвестного состояния.

Delayed focus/selection callbacks проверяют lifetime и committed revision, к которой относились. Callback от Undo не должен перезаписывать selection более поздней команды. При destroyed/failed scope он не выполняется.

### 4.4. Единый event contract

Сохранить публичные имена событий, заменить неоднозначную форму payload типизированным `EditorEventMap`. `on<K extends keyof EditorEventMap>(name: K, listener: (event: EditorEventMap[K]) => void | Promise<void>)` возвращает unsubscribe.

```ts
interface TransactionCommitted {
  sequence: number
  origin: 'user' | 'native-input' | 'plugin' | 'external' | 'history'
  action: 'commit' | 'undo' | 'redo' | 'reset'
  name: string
  changes: readonly DocumentChange[]
  before: Readonly<{mode: DocumentMode; effectiveReadOnly: boolean}>
  after: Readonly<{mode: DocumentMode; effectiveReadOnly: boolean}>
  history: Readonly<{canUndo: boolean; canRedo: boolean}>
}
```

`DocumentChange` переиспользует существующие insert/remove/update/move/document.replace значения. Верхнеуровневые `changes` присутствуют всегда. Для undo это **применённые inverse changes в порядке применения**, для redo — forward; это не исходный record без указания направления. Reset содержит document.replace, хотя history record отсутствует. `record` не нужен внешнему listener для извлечения changes и удаляется из публичного event payload; внутренний HistoryStore record не является публичным контрактом.

`document:changed` получает `{origin, action, changes}` из того же committed event. `history:changed` получает доступность операций с учётом effectiveReadOnly. `readOnly:changed` получает `{readOnly: effectiveReadOnly}` только при фактическом изменении effective flag. При render mode boundary оно идёт после document observations и видит уже committed state. Обычный setReadOnly публикует readOnly/history-availability, не transaction/document change. Не менять текущие shapes currentBlock/selection/ready/destroyed без необходимости; добавить их точные типы в EventMap.

No-op не создаёт record, document event или onChange. Mutations из синхронного post-commit listener отклоняются как reentry без отката завершённой операции; follow-up вызывается отдельной командой после возврата. ChangeNotifier остаётся post-commit debounced observation, не участником native-input commit. Validation issues ingestion накапливаются во время preparation: при preserve выдаются после согласованного commit, при strict rejection — после завершения failed preparation без document event; validation callback не вызывается посреди незавершённого state transition. Вложенные синхронные document operations в building phase используют один draft; inner failure делает outer transaction неуспешной, даже если вызывающий код поймал исключение. Это не разрешает reentry из projection/plugin/observer callbacks.

## 5. C2 — канонические преобразования и идентичности

Развести сериализованные input shapes и внутренние записи. У активного canonical block обязательны id/type/current dataVersion; у preserved записи неизвестные JSON-safe поля сохраняются как opaque content. Нельзя навязывать неизвестной версии currentVersion или запускать её runtime.

```ts
type Json = null | boolean | number | string | Json[] | {[key: string]: Json}
type JsonObject = {[key: string]: Json}
type InlineMap = Readonly<Record<string, EditorInlineWidget>>
interface LocalBlockInput {
  kind: 'local'
  type: string
  data: JsonObject
  tunes?: JsonObject
  inline?: InlineMap
}
interface SerializedBlockInput {
  kind: 'serialized'
  block: EditorBlockData
}
```

`Json` на runtime-границе дополнительно проверяется существующей JSON ownership policy: конечные числа, dense arrays, допустимые prototypes, однократное наблюдение accessor-backed input, отсутствие функций/cycles/exotic instances. TS alias не заменяет validation. `kind` — дискриминатор внутренней команды, не новое поле сохранённого block JSON.

У CanonicalTransforms одна операция сборки изменённой активной записи: `assemble(definition, data, tunes, sourceInline, referenceMapping)`. Она использует существующие schema.encode, mapRichText, richTextCodec/operations; конкретное имя helper не публичный API. Полная/частичная/cross конвертация, split/merge, typed fragment insertion и projection commit обязаны вызывать один этот инвариант, а не вручную собирать `next`.

Правила:

1. `schema.encode` валидирует актуальные локальные данные; output dataVersion равен schema.currentVersion. Все schema-declared rich-text поля нормализуются одной политикой. Code/raw/plain-text не объявляются rich-text ради удобства generic transform.
2. Inline reference — токен, для которого существует собственная запись sidecar. Токен без записи — литеральный текст; не удалять и не связывать его случайно. Известный тип проверяется его схемой, неизвестный JSON-safe payload сохраняется opaque без запуска plugin.
3. При сборке изменённого **активного** блока переносить все используемые ссылки; неиспользуемые sidecar entries удалять. Полностью preserved/unknown record при move/copy не интерпретируется и не очищается по незнакомой схеме.
4. При объединении нескольких источников сначала резервировать ID всех ссылок **и всех литеральных токенов** в участвующих текстах. Коллизии получают свежие ID; менять только связанные occurrence исходного источника. Два одинаково написанных токена из разных источников не получают общий payload по совпадению строки.
5. При переносе подмножества полей remap проходит по всем полям, в которые этот источник реально перенесён. Copy/import создаёт новые block identities и обновляет ссылки согласованно. Stable subfield ID уникальны в своём block-local namespace; core allocator не переиспользует выданные живой сессии identities. Миграции остаются детерминированными, не используют session allocator.
6. Whole conversion сохраняет block ID, tunes и связанный payload. Split сохраняет identity исходного remainder и выдаёт новые для новых блоков; структурные capabilities определяют новые nested IDs через DataOperationContext. Move не меняет data/tunes/inline/producer revision.
7. Изменение data/tunes/inline удаляет заимствованный producer `revision`, если новый корректный revision не вычисляет его владелец. Нельзя передавать старый revision renderer и ожидать deep-signature fallback.
8. Неподдерживаемая конвертация отклоняется до удаления источника. Explicit non-text conversion существующего UI сохраняет текущую документированную семантику замены выбранного интервала; не выдавать её за автоматический безопасный fallback для ошибки clipboard.

Logical offsets сохраняют единицы существующего `shared/textOffset.js`: UTF-16 позиции текста и согласованная длина атомарного inline widget. Один codec должен использоваться для selection, slicing и hydration; не переходить незаметно на grapheme indexing. Разрыв строки считается по действующему logical codec, а не через отдельные приблизительные DOM textContent подсчёты.

## 6. C3 — входные данные и HTML paste

### 6.1. Два входа, один canonical candidate

- `LocalBlockInput`: зарегистрированный тип обязателен; вызвать encode актуальной схемы. Отсутствие dataVersion здесь не означает v1, потому что version lookup не выполняется вообще.
- `SerializedBlockInput`: сначала ownership/JSON validation, затем decode указанной версии; отсутствие dataVersion допустимо только по действующей legacyVersion policy. Unknown/future content проходит inert-preserve, strict известного невалидного input отклоняется до mutation.
- Оба входа дают внутренний подготовленный block candidate; live insertion получает только такие кандидаты. ID продюсера не переиспользуется при Copy/Paste. Опции позиции/selection не находятся в persisted payload.
- Удалить двусмысленный внутренний вызов `insertExternalBlocks` из локального HTML-парсера. Одноимённый internal метод заменить явными normalize-input + insert-prepared операциями. Public block insert остаётся локальным актуальным API, host render — внешним document API.

### 6.2. Структурная маршрутизация HTML

Существующий `paste.accepts/resolve` для text/file сохранить по ответственности; добавить `BlockCapabilities.htmlImport?: HtmlImportCapability<D>` для HTML subtree import. Из `PasteInput` удалить вариант kind:html: он больше не является входом accepts/resolve. Все встроенные потребители `kind:'html'` переходят на неё, старый whole-input HTML resolver после перехода удаляется.

```ts
interface HtmlImportContext extends DataOperationContext {
  readonly ownerDocument: Document
  serializeRichText(node: Element): string
}
interface HtmlImportCapability<D extends JsonObject> {
  matchesRoot(element: Element): boolean
  importRoot(element: Element, context: HtmlImportContext): D
}
```

`element` — detached, прошедший действующую sanitization boundary узел из предоставленного документа. Capability синхронна, side-effect-free, возвращает актуальные локальные данные своего type. `matchesRoot` относится к **самому предложенному root**, а не к найденному где-либо descendant. `importRoot` потребляет целиком этот root. Ошибка после принятия root — ошибка всего плана, не повод вызывать другой resolver с уже частично обработанным источником. Внешний async upload/metadata lookup остаётся text/file resolution вне транзакции.

Роутер посещает весь sanitized input в DOM-порядке, включая text nodes между элементами. Для matched root выдаёт LocalBlockInput, пропуская его descendants как отдельно потреблённые. Для неподдерживаемого structural wrapper обходит детей; для rich-text inline wrappers сохраняет обрамление и группирует смежные inline/text узлы в rich-text segment. Не использовать `children` как единственный источник, теряя соседние текстовые узлы.

При нескольких совпадениях: capability текущего target type имеет приоритет, далее порядок регистрации block definitions. Каждый root разрешается один раз. No-match даёт rich-text segment через общий codec; неподдерживаемый активный HTML не сохраняется как исполняемый raw block. Типы `paragraph/list/heading/quote` в core routing не перечисляются. Neutral conversion payload имеет существующий shape `{kind: 'rich-text', data: {text: html}}`. Generic rich-text segment материализуется через conversion capability настроенного default block; если её нет, первый зарегистрированный тип, который явно принимает neutral rich-text payload; если нет ни одного — `unsupported`, без удаления selection.

Весь input нормализуется и проверяется **до** первого live insert/update/remove. Для `p + ul + p`, вложенных wrappers и mixed text ни один sibling не теряется и не дублируется. Test fixture задаёт ожидаемый упорядоченный набор блоков и содержимое, а не только наличие списка.

Text/file routing выбирает первый accepts=true: сначала target type, затем порядок регистрации. resolve=null означает unsupported и отсутствие commit, а не вызов следующего уже после resolution; plain-text fallback возможен при отсутствии совпавшего accepts, но не после ошибки принятого resolver. Async text/file routing имеет собственный cancellation scope. Результат разрешается применить только если живы editor/document generation/anchor identity и target selection lease, interaction не стала readOnly, и resolver task не отменена. Подготовленные ранее куски не фиксируются отдельно. Ошибка/отмена оставляет исходный документ; никакого скрытого retry или fallback к другому provider после начатого side effect. Новый таймаут/retry count не вводится.

## 7. C4 — канонический clipboard-фрагмент

### 7.1. Формат и доверие

Использовать MIME **`application/x-rector-fragment`**, новый **`version: 2`**. V1 использовал иной shape `{version:1, html, inline}`; новую структуру нельзя маркировать version1. Требования обмена с работающим v1 editor нет: несовместимый старый wire не поддерживать отдельным runtime/decoder, обычные HTML/plain fallbacks остаются.

```ts
interface TransferBlock {
  type: string
  dataVersion?: number // отсутствие сохраняется только у opaque внешнего блока
  data: JsonObject
  tunes?: JsonObject
  inline?: InlineMap
}
type FragmentPart =
  | { kind: 'rich-text'; html: string; inline?: InlineMap }
  | { kind: 'block'; block: TransferBlock }
interface ClipboardFragmentV2 {
  version: 2
  parts: readonly FragmentPart[] // dense, непустой, в порядке содержимого
}
```

У active block output dataVersion обязателен. TransferBlock не несёт исходный block ID, producer revision, DOM или selection source coordinates. У полностью opaque block дополнительные JSON-safe envelope fields, кроме id/revision, переносятся без интерпретации; известные ключи не переопределяются через extras. Закрытый allowlist известных полей не должен незаметно обрезать unknown record. Rich-text parts имеют **собственный** inline namespace; одинаковые ID между parts не означают shared identity. Clipboard не получает полные source records с невыделенными текстами «для последующего slicing».

Codec валидирует всю структуру, версии, JSON и sidecar до создания insertion plan. Wire input всегда внешний, независимо от MIME: page/script/другой editor может сформировать его. Известные block/inline данные проходят shared schemas, HTML — общий sanitizer. Неизвестные JSON-safe block/inline values сохраняются инертно; они никогда не запускают неизвестную capability. При невозможности безопасно представить opaque input вставка отклоняется, а не превращает его незаметно в текст.

`CopyResult = {fragment: ClipboardFragmentV2, html: string, text: string, requiresPrivateFormat: boolean}` — внутренний результат одного model serializer. `requiresPrivateFormat=true`, если HTML/plain не способны перенести opaque payload или точную структуру выбранного нетекстового/составного блока. Блоки со всеми привычными DOM атрибутами не считаются доказанно восстановимыми только потому, что сейчас существует их renderer.

### 7.2. Выделение и экспорт

Selection owner предоставляет model bookmark и ordered affected blocks/fields. Полностью выбранный блок переносится TransferBlock без source identity; частичный простой rich-text — rich-text part. Частичный HTML вырезается из canonical field codec с сохранением окружающих b/a/span marks, даже если DOM Range.cloneContents вернул только text node. Widget считается атомом; частичное визуальное попадание normalizes к границе атома, не экспортирует половину payload.

Для составного выбранного содержимого добавить `BlockCapabilities.clipboard?: ClipboardCapability<D>` — чистую capability в plugin-kit:

```ts
interface ClipboardSelectionContext extends DataOperationContext {
  // Возвращает только выбранный HTML указанного schema-declared поля.
  selectedHtml(fieldKey: string): string | null
  // true, если поле выбрано целиком; empty field тоже имеет определённую границу.
  isWholeField(fieldKey: string): boolean
}
interface ClipboardCapability<D extends JsonObject> {
  exportSelection(
    data: Readonly<D>,
    context: ClipboardSelectionContext,
  ): readonly ({kind: 'local-block'; data: D} | {kind: 'rich-text'; html: string})[]
}
```

`local-block` всегда принадлежит type текущей definition; core encode задаёт dataVersion и прикрепляет только используемый inline из исходного блока. Capability не обращается к editor/managers и не распоряжается history. Whole block export не требует этой capability. Для простого single-field rich-text есть schema-driven generic exporter; он не знает название paragraph. Multi-field built-ins реализуют явный exporter, а не универсальное копирование всей data с секретными невыделенными значениями.

| Выбранное содержимое | Экспорт частичного фрагмента | Удаление выбранного из источника |
|---|---|---|
| Paragraph/Heading и одно простое текстовое поле | Rich-text part с marks/inline | Удалить ровно интервал, сохранить тип и остальную data/tunes. |
| List/Checklist, несколько items | Один локальный блок того же типа: только пересекающиеся items; обрезать endpoint text, сохранить style/checked выбранных items | Удалить целиком выбранные items, endpoint items обрезать; если контейнер остаётся, сохранить его допустимый default-empty invariant. |
| Table, несколько cells | Локальная таблица минимального прямоугольника выбранных cells; endpoint text обрезать, невыбранные ячейки внутри прямоугольника пустые; не копировать их исходный текст | Сохранить сетку/невыбранные cells, очистить выбранные интервалы; whole-block selection удаляет таблицу целиком. |
| Columns, несколько columns | Тот же layout с выбранным HTML и пустыми невыбранными колонками, без их source content | Сохранить layout/колонки, удалить выбранный HTML. |
| Quote/Warning/Toggle/Spoiler, несколько полей | Локальный блок: выбранные поля с slices, остальные текстовые поля из createDefault; структурные флаги сохранить | Сохранить контейнер и невыбранные поля, очистить выбранные интервалы. |
| Подпись Image/Gallery/Carousel и подобное rich-text поле | Rich-text part; не добавлять невыбранные URL/медиа-данные | Менять только подпись. |
| Plain-text native input/textarea | Native text clipboard при обычном field selection; canonical input sync сохраняется | Нативное удаление с последующим обычным document input commit. |
| Unknown/preserved block | Только whole TransferBlock, opaque | Только whole-block removal в editable document mode. |

ClipboardCapability отвечает за структуру экспортируемого подмножества; удаление/остатки остаются в **единственном** document selection transformation owner. Не создавать plugin DOM-cut механизм. Порядок полей берётся из schema-declared logical field traversal, не случайного querySelectorAll после toolbar mutations.

### 7.3. Запись Copy/Cut и пределы атомарности

Copy и Cut вызывают один serializer и пишут text/plain, text/html и private MIME в обработчике доверенного clipboard event. До mutation все необходимые payload уже вычислены. Сразу вызвать preventDefault для перехваченного Cut, чтобы ошибка custom handling не запустила native deletion.

После setData проверить доступные types/readback того же DataTransfer. Если обязательное представление отсутствует, возвращается `clipboard-write-failed`; документ, selection и history остаются прежними. Для requiresPrivateFormat нельзя считать успешным один writeText fallback. Для rich-text обязательны HTML и text, для opaque/структурного фрагмента — также private формат. Уничтоженный/readOnly редактор никогда не продолжает удаление. После записи перепроверить captured source generation, committed revision и logical selection lease; если они устарели, не удалять другое текущее выделение.

Это гарантия для **обнаруживаемых** ошибок clipboard event boundary. Согласно [W3C Clipboard API and events](https://www.w3.org/TR/clipboard-apis/), фактическая запись системного clipboard выполняется платформой после обработки event; synthetic events не меняют системный буфер. setData не предоставляет durable acknowledgement. Поэтому нельзя обещать общую транзакцию с ОС или выдавать DataTransfer double за real clipboard proof. Если запись состоялась, а последующая document transaction отклонена, допустимый безопасный исход — содержимое скопировано, но не удалено. Частичное удаление недопустимо.

Async Clipboard API не подставляется молча вместо event protocol для потерь metadata. Browser acceptance использует настоящие copy/cut/paste gestures и проверяет перенос в независимый editor instance. При обнаруживаемом отказе private type разрушительный opaque Cut блокируется. Успешный event readback не доказывает последующее сохранение private type ОС; универсальный синхронный preflight этого результата не предполагается. Если browser roundtrip не подтверждает передачу private type, соответствующую платформенную возможность нельзя объявить принятой: ограничение документируется, а feature parity по этому сценарию остаётся неподтверждённым. Недоказуемую гарантию скрытого сбоя ОС не заявлять.

### 7.4. Разбор Paste и размещение

Один порядок для collapsed, native range, cross-field и whole-block selection:

1. Валидный fragment v2.
2. Files через file capability, когда usable fragment отсутствует.
3. HTML через C3.
4. Plain text; inline pattern/trigger interpretation только в разрешённом rich-text owner.

Если private MIME присутствует, но невалиден/версия неизвестна, non-destructive Copy не затрагивается; Paste может использовать независимый HTML/plain fallback **до любой mutation**. Если valid private fragment содержит opaque data, но целевая операция не умеет безопасно его применить, возвращается unsupported без lossy fallback. Ни один accepted resolver не запускается повторно в другом режиме после побочного эффекта.

Сначала строится `PreparedInsertion` из snapshot selection и generation. Затем единственная document-команда проверяет актуальность anchor/selection и атомарно применяет removal+insertion+inline remap. При obsolete target результат `stale-target`, без побочных эффектов. Если history coalescing разрешён для обычного typing, он не склеивает отдельные Paste/Cut с соседним вводом.

Нормативное размещение:

- Один rich-text part в одном rich-text поле заменяет диапазон внутри того же поля; структура target и невыделенные поля не меняются.
- Последовательные rich-text parts объединяются через один `<br>` между соседними parts, нормализованный общим codec, сохраняя sidecar boundaries до remap. Результат не строится склейкой live widget DOM.
- Whole-block selection заменяется упорядоченными part-блоками; rich-text материализуется по C3. Невыбранные блоки сохраняют ID, data и instance.
- Block parts в простом single-field текстовом блоке вставляются между левым/правым невыделенными текстовыми остатками; пустой replaceable target не оставляет лишнего пустого блока. Остатки используют существующие pure split/conversion правила и C2, не произвольный data merge.
- Block parts при selection внутри одного составного контейнера не внедряются как nested block JSON в его поля. Выбранное содержимое удаляется по таблице §7.2, невыбранная структура остаётся, новые blocks располагаются непосредственно после surviving owning block. Это явное ограничение плоской block model, не аварийный fallback после потери данных. Оно проверяется отдельным контрактным сценарием.
- При межблочном диапазоне сохранить левый endpoint remainder, вставить parts, затем правый remainder; полностью выбранные внутренние блоки удаляются. Для одного и того же составного owning block использовать предыдущую строку, не дублировать его.
- Совместимые текстовые остатки можно соединять только через заявленную merge/conversion capability без потерь data/tunes/inline; если это не доказано, оставить раздельные блоки. Изменение структуры при block-fragment insertion явно наблюдаемо и не должно маскироваться в parity normalizer.

Фокус после Paste — конец последнего вставленного содержимого; после Cut — начало удалённого диапазона в сохранившемся ближайшем поле/блоке. Focus и logical selection входят в history bookmark операции. При отсутствии surviving блока создаётся один текущий default block по действующему invariant.

## 8. C5 — definitions, contexts и lifecycle

### 8.1. Snapshot и ранняя проверка

ExtensionRegistry сначала получает snapshot всех используемых descriptor members, затем validates, затем setup. Не хранить mutable caller-owned definition/schema/capability metadata по ссылке. Функциональные members наблюдаются один раз и вызываются с сохранённым корректным receiver. Не deep-freeze caller object и не выполнять getter повторно на setup/dispatch. Уже immutable shared schema можно удерживать как immutable dependency; mutable descriptor фиксируется host-owned wrapper с захваченными methods. Это не второй набор схем и не изменение identity фабричных shared schema objects, сравниваемых editor/renderer tests.

Обязательные проверки: уникальные непустые type, dense arrays, зарегистрированный defaultBlock; schema createDefault/decode/encode и положительные safe-integer currentVersion/legacyVersion с legacyVersion <= currentVersion; setup function; корректные optional members, если они заданы. Default каждого toolbox-insertable блока должен пройти encode и decode текущей версии с тем же каноническим значением, не только один encode. mapRichText требуется только у заявленных rich-text schemas, а не у всех блоков.

Setup не вызывается при ошибке descriptor validation. Если ошибка возникает после приобретения styles/runtime, все уже полученные ресурсы освобождаются в обратном порядке. Некорректный runtime/instance после setup/create также попадает в локальный cleanup scope; его destroy вызывается, если был получен корректный destroy member, остальные scopes не пропускаются.

### 8.2. Revocable context

У каждого block/inline occurrence scope имеет состояния `staged -> active -> revoked`. Он содержит document generation, mount token, block ID/type и для inline — widget identity/field ownership. Сравнение только block ID недостаточно.

- В staged scope `getData()` читает candidate initial/current staging record, а не старый committed record с таким же ID. Persist/DOM mutations запрещены до activation.
- Active context читает последнюю committed data своего живого occurrence через immutable read. updateData сначала проверяет lease, effectiveReadOnly, phase; только затем вызывает producer и C2/transaction.
- После revoke updateData/commitDomMutation/requestSplit/requestExit — безопасные no-op; переданный producer/operation не вызывается. getData/createId после revoke бросают ошибку с name `AbortError`, isReadOnly возвращает true. Асинхронные callbacks не должны считать истёкший read доступным.
- Mutation из prepare/apply/recover/publishing — reentry error до вызова producer, даже если scope active. Ошибка не может протечь как частично выполненная plugin mutation.
- При conversion/removal/replacement/destroy соответствующие scopes отзываются. Undo, повторный render или block ID collision не оживляют их.
- ReadOnly transition не пересоздаёт block scopes; он блокирует новые plugin operations и отменяет текущие interaction-owned upload/paste/trigger task scopes. Асинхронный task дополнительно хранит свой serial/selection/document lifetime, поэтому после readOnly true→false не возобновляется отменённая задача. Request ordering внутри одного plugin остаётся его ответственностью, host guards её не заменяют.

Contract staged getData/isReadOnly использует explicit candidate view C1; public save/get в это время по-прежнему читают committed view.

Существующий AbortSignal остаётся публичным механизмом отмены, но не единственным условием допуска mutation: host-side lease обязателен. Не доверять флагу, который расширение должно было проверить самостоятельно.

### 8.3. Владение projection resources

Scope создаётся **перед** первым extension callback. AbortController и созданный instance немедленно регистрируются в scope. Ошибка create, setReadOnly, editableFields, inline create/update или style acquisition освобождает всё уже приобретённое. Только успешный stage передаёт scope в prepared projection; только commit — в active owner. Scope destroy сначала отзывает полномочия, затем вызывает пользовательский dispose, чтобы reentrant cleanup не смог изменить новый документ.

Незатронутые block/inline instances сохраняются при move, ordinary edit и readOnly. Принцип распространяется и на временные popup/trigger listeners, pending focus, image readers и upload subscriptions. Не вводить отдельную универсальную resource framework: использовать и усилить существующий LifecycleScope.

## 9. C6 — ownership, selection и форматирование

### 9.1. Общая классификация event target

Ввести внутренний результат classification:

```ts
type InteractionOwner =
  | {kind: 'document-rich-text'; blockId: string; fieldKey: string}
  | {kind: 'document-plain-text'; blockId: string; fieldKey: string}
  | {kind: 'auxiliary-native'}
  | {kind: 'editor-chrome'}
  | {kind: 'outside'}
```

Сначала определить ближайший editing/native control и принадлежность текущему editor root/owned popup. Registered EditableField из reconciler — основание document ownership. DOM marker, совпадение data-block-id или ancestor contenteditable сами по себе полномочий не дают. Вложенный input/textarea/select или независимый editing host без точной регистрации классифицируется auxiliary-native. Shadow/nested targets использовать по composed path при наличии; не переносить событие в другой editor по stale selection.

KeyboardRouter остаётся единственным владельцем editor keyboard dispatch. До inline shortcuts и Mod+Z/Y он выполняет ownership resolution. Auxiliary native controls и outside не вызывают document commands/preventDefault. Registered plain-text controls используют canonical history, но не rich-text formatting. Buttons/links editor chrome сохраняют доступ к document history; текстовый input внутри popup остаётся auxiliary. Сохранённый range для toolbar допускается только для trusted editor-chrome gesture и живого selection lease.

Keydown и beforeinput должны согласованно обрабатывать browser historyUndo/historyRedo: не выполнить одну команду дважды, native history auxiliary field не перехватывать. IME composing/keyCode229 не запускает structural/formatting shortcut. ReadOnly подавляет persist gestures независимо от их ownership, но не запрещает Copy выделенного содержимого.

### 9.2. Один protected projection-edit seam

Публичный plugin context не получает список чужих блоков. Внутри DocumentRuntime заменить отдельные single/multiple способы на один scope-limited projection edit:

```ts
interface ProjectionEditRequest {
  blockIds: readonly string[]
  origin: 'user' | 'native-input' | 'plugin'
  name: string
  selectionBefore: LogicalBookmark | null
}
// Внутренний port, не export для приложений:
runProjectionEdit(request: ProjectionEditRequest, operation: () => void): void
```

До operation проверить phase/health/authority, все IDs/leases, зафиксировать committed recovery baseline и logical selection; войти в охраняемую synchronous edit phase. Затем выполнить operation, прочитать только affected registered projection fields, C2-normalize и подготовить одну transaction/history entry. При любой ошибке operation/read/encode вернуть проекцию к committed state; модель/история не меняются. Async operation/thenable запрещён и не принимается как отложенная часть транзакции. Guard устанавливается **до DOM callback**, не как в текущем syncBlocksFromProjection.

Plugin commitDomMutation адаптируется к одному собственному block ID и этому же seam. Inline toolbar разрешает список всех действительно выбранных rich-text owners, включая разные fields одной таблицы. NativeInputController сохраняет особый ingress браузерного ввода: browser projection уже могла измениться; controller немедленно assimilates только своего owner через те же normalize/commit/recovery правила. Не превращать IME в серию команд на каждое промежуточное compositionupdate и не откладывать persistence до save/debounce.

`syncBlocksFromProjection` и `syncBlockFromProjection` не остаются двумя алгоритмами с разными phase/recovery правилами. После миграции callers удалить superseded реализации; допустимый тонкий scoped adapter не должен содержать вторую transaction orchestration.

### 9.3. Binding и доступность inline tools

Сохранить узкую форму selection port, завершить её семантику:

```ts
interface CrossEditableSelectionPort {
  readonly range: Range | null // отделённый snapshot текущей живой selection
  activate(range: Range): boolean
  deactivate(): void
}
interface SelectionPortBindable {
  bindSelectionPort(port: CrossEditableSelectionPort | null): void
}
```

Range остаётся transient DOM-view, не persist source. activate принимает несколько rich-text fields одного или нескольких блоков; endpoints должны принадлежать текущему editor. Однополевой/collapsed/недействительный range возвращает false без побочных эффектов. deactivate() не принимает старый editor argument. Binding не даёт права изменять документ и не открывает mutable manager.

`createEditorRuntime` создаёт один SelectionController/порт, связывает каждый configured inline tool с портом до использования и регистрирует unbind(null) в lifecycle. Нельзя доказывать binding тестом, который вручную вызывает bindSelectionPort, минуя composition. Tool instance принадлежит одному editor: повторное simultaneous присоединение одного mutable tool instance отклоняется; фабрика может создавать независимые instances. Binding после destroy не выполняется, порт отзывается и не удерживает root через retained tools.

InlineToolbar определяет eligibility по **всем выбранным полям**. Tool доступен только при поддержке его capability всеми затронутыми rich-text owners; несовместимое plain-text/opaque поле не форматируется и не скрывается от проверки выборочным пропуском. Нет общего guard «разные blockId — return». Toolbar click и shortcut используют один resolved logical selection и один protected edit, не цикл самостоятельных history operations.

Alignment — block-level команда по уникальным выбранным block ID. Расширить `InlineMutationContext` и `InlineToolActionContext` явным `setTextAlign(value: 'left'|'center'|'right'|'justify'|null): void`. Core проверяет текущую logical selection/authority и одной транзакцией меняет только tunes.textAlign; null очищает tune. Для состояния action panel эти же contexts дают `getTextAlign(): 'left'|'center'|'right'|'justify'|'mixed'`, где отсутствие tune читается как left, а разные значения выбранных блоков — mixed. Toolbar формирует этот immutable query из канонических tunes; align не определяет состояние через ближайший private core DOM wrapper. Align tool не пишет data.align и не рассчитывает, что DOM style будет сериализован generic field read. Остальные text tools используют protected edit. ClearFormatting очищает character formatting выбранных интервалов; alignment снимается только явным align reset, не побочным стиранием wrapper style.

У inline tools убрать зависимости от private core/dom, core/icons и core/constants в align/caseTransform/utils/fontSize/link. Нейтральные DOM/icon helpers переместить в shared и экспортировать необходимую часть через plugin-kit без второй реализации. Core-wrapper lookup и selection/block classification не переносятся как публичные selectors: их заменяет C6 port/мутационный context.

Для multi-field formatting failure второго affected field восстанавливает первое и второе; одного Undo достаточно для успешной операции. Сохраняются направление selection, collapsed caret semantics и inline payload. Исторические before/after bookmarks отражают пользовательский результат, а не случайный временный range toolbar.

## 10. C7 — drag, локализация и дешёвые запросы

### 10.1. Pointer-сессия

DragController имеет не более одной активной сессии на editor, привязанной к pointerId и source lifetime. Рассчитывать placement по массиву ID **без dragged ID**, как gap 0..N-1 либо beforeId/afterId. В конце преобразовать gap в конечный нулевой индекс DocumentRuntime.move. A/B/C/D → gap между B и C даёт B/A/C/D.

Pointermove не изменяет document model/history, только preview. Pointerup в живой writable session фиксирует максимум одну move-команду; тот же порядок — no-op. Pointer другого ID игнорируется. Cancel/destroy/readOnly/document replacement/source removal освобождают listeners, pointer capture, body/editor classes, preview/spacer и возможный click suppression. Suppression привязан к текущему gesture и не остаётся до произвольного будущего click. Late pointerup не выполняет move/focus.

DOM/instance dragged и остальных unchanged blocks не пересоздаются. Изменение порядка другим документным действием между down/up отменяет устаревшую сессию, а не применяет индекс старого массива.

### 10.2. Локализация

Block runtime использует `plugin.<type>.*`, inline runtime — **`inlinePlugin.<type>.*`**, как существующие aggregate dictionaries. Ошибочный `inline.*` alias не сохраняется. Shared definition не мутируется локалью. Fallback остаётся для действительно отсутствующего ключа, а не для системной ошибки namespace. Проверить реальный mention popup/noResults в ru/en и повторное создание editor с теми же definitions.

### 10.3. Query port

Добавить внутренние запросы Store/DocumentRuntime:

```ts
interface DocumentQuery {
  readonly size: number
  has(id: string): boolean
  idAt(index: number): string | undefined
  indexOf(id: string): number // -1 при отсутствии
  ids(): readonly string[] // порядок документа, caller не может изменить Store
  peek(id: string): DeepReadonly<CanonicalRecord> | undefined
}
```

Это internal-only port: public get/at/list/save по-прежнему возвращают отделённые snapshots. `peek` не покидает core через plugins/app events. Empty/invalid integer index в idAt возвращает undefined; публичные mutation range errors сохраняют свои contracts.

InteractionState, EditorViewModel и ID-only selection/drag/public count paths используют query metadata, не `list().map(id)`. `has/idAt/size/peek` не обходят data; indexOf/ids могут обходить order, но не payload. После commit selection/current-ID reconciliation получает изменения структуры или один ID snapshot. Это устраняет подтверждённую стоимость R10 без второй mutable copy document data.

Draft/commit могут пока иметь O(N) shallow index copying. Не объявлять все команды O(1), не внедрять persistent tree/rope только ради этой задачи. Проверять отдельно количество payload reads/clones, touched projection count и измеренную длительность. Сохранить текущие gzip budgets **51/40/64/96 KiB** для core/paragraph/defaultInteractive/fullPreset; пересматривать цифры только отдельным обоснованным изменением требований, не способом пройти данный план.

## 11. Ошибки, безопасность и канонические типы

Ошибочный local input/schema output — validation failure до commit; сохраняются существующие TypeError/RangeError для malformed arguments и индексов. Reentry/failed runtime — явное отклонение команды, не silent data change. Внутренний clipboard result различает `unsupported`, `invalid-input`, `stale-target`, `cancelled`, `clipboard-write-failed`; event adapter удерживает документ и публикует content-free diagnostic, не бросает необработанный Promise из listener. Эти outcomes — внутренний result port, не обязательное добавление нового публичного exception hierarchy.

Preserved record остаётся inert независимо от clipboard MIME или наличия совпадающего DOM marker. Local factory/config/plugin JS доверен как код приложения, но его lifetime/descriptor проверяется для защиты корректности; это не sandbox против вредоносного same-origin JS. Не заявлять security isolation сильнее реально предоставляемого браузером.

Использовать действующие shared sanitization/URL/Trusted Types функции. Не вводить дополнительный inline parser с более мягким allowlist и не вставлять clipboard HTML через raw innerHTML без установленной policy. Diagnostics не включают HTML/JSON документа, имя файла пользователя или provider secrets. Числовые лимиты, retries, TTL и latency SLA сверх уже существующих не вводятся.

Канонические объявления контрактов: `plugin-kit/types.d.ts`, `inline-tools/types.d.ts`, `shared/documentTypes.d.ts`, `core/publicTypes.d.ts` и JSDoc исходных реализаций. Уточнить active canonical vs external/opaque input типы без объявления обязательной current версии для неизвестных данных. `dist/**/*.d.ts` — результат `scripts/generate-declarations.mjs`/build, не самостоятельная правка. Одинаково обновить package examples, docs en/ru и documentation-contract checks. Исправлять реальные callers C6, а не добавлять лишние optional args ради устранения TS2554.

## 12. Карта изменения и замены

Новые расположения ниже **предлагаются**; существующие paths прочитаны на проверенном SHA.

| Текущий владелец/путь | Целевое изменение | Замена/удаление и consumers |
|---|---|---|
| `core/DocumentRuntime.js`: ingest helpers | Выделить `core/DocumentIngestion.js` | Перенести логику один раз; constructor/render вызывают один preparation contract. |
| Тот же файл: record assembly/remap/filter helpers | Выделить `core/CanonicalTransforms.js` с использованием shared richTextOperations | Удалить ручную сборку next из convert и дубли в selection paths; migrate split/merge/clipboard/projection. |
| `core/DocumentStore.js`, `TransactionEngine.js`, `HistoryStore.js` | C1 metadata, prepared commit/history и одинаковые events | Удалить post-reset mode assignment и post-store fallible history validation; migrate runtime/reconciler/tests. |
| `core/BlockReconciler.js`, `InlineProjectionRuntime.js`, `LifecycleScope.js` | Prepared scopes/activation/rollback C1+C5 | Удалить незащищённые create/update до scope ownership; сохранить один reconciler. |
| `core/ClipboardController.js` | Thin event adapter; proposed `core/clipboard/FragmentCodec.js` и `FragmentImport.js` | Удалить старый whole-block MIME как отдельный рабочий путь, copy/cut forks, special cross-paste shortcut и hardcoded #htmlBlockRecords. Путь `core/clipboard` создаётся под новым API, не восстановлением v1 runtime. |
| `plugin-kit/types.d.ts`, HTML paste capabilities в embed/heading/table/gallery/list/carousel/code/link-preview/image | C3 matchesRoot/importRoot; pure clipboard exporter для составных built-ins | Перевести старые kind:html accepts/resolve branches; text/file responsibility сохранить. Встроенные реализации и third-party guide соответствуют одному контракту. |
| `core/SelectionController.js`, `LogicalSelection.js`, `shared/richTextOperations.js` | Общая model selection extraction/replacement C2+C4 | Не добавлять второй DOM-cut algorithm. Расширить same-block multi-field cases. |
| `core/KeyboardRouter.js`, `NativeInputController.js`, `InlineToolbar.js`, clipboard | Proposed `core/InteractionOwnership.js` C6 | Заменить ранний безусловный Mod+Z/Y; один keyboard dispatcher, без нового ShortcutRegistry. |
| `core/createEditorRuntime.js`, `InlineToolbar.js`, inline tool factories/utils | Реальный lifecycle binding, protected edit, align tune command | Удалить устаревшие extra args, невключённые parallel sync paths и same-block-only guards. |
| `core/PublicEditorApi.js`, `core/publicTypes.d.ts`, composition + ClipboardController.handleTransaction | Типизированный EventMap C1 | `event.record?.changes` → `event.changes`; публичная зависимость от HistoryStore record удаляется. |
| `core/ExtensionRegistry.js` | Snapshot/validate/setup и namespace C5/C7 | Не хранить изменяемые исходные descriptors; не сохранять ошибочный inline.* alias. |
| `core/DragController.js` | Scoped pointer session и final-index C7 | Удалить document listeners, не охваченные active scope, и pending swallow listener без границы lifetime. |
| `core/InteractionState.js`, `EditorViewModel.js`, public query adapters | Internal metadata query C7 | `list().map/findIndex` для ID-only задач заменить; public snapshot API не удалять. |
| `docs/guide/*`, `docs/ru/guide/*`, `index.html`, README examples, declaration fixtures | Новый API и фактическое wiring | Обновлять канонические источники, генерировать declarations; старые примеры/aliases удалить. |
| `benchmarks/bundle-budget.mjs`, browser runners, shared architecture checks | Сохранить бюджеты и усилить proof | Не поднимать threshold, не удалять проверки ради зелёного результата. |

Поиск consumers охватывает source imports, factory/registry enumeration, runtime callbacks, docs examples, scripts, browser fixtures и генерируемые декларации. Текстовый grep не заменяет conformance всех зарегистрированных factories. Сторонние опубликованные v2 extension implementations потребуют обновления по breaking guide; их исходники не заявляются проверенными и compatibility shim для них не создаётся.

## 13. План реализации — вертикальные этапы

Каждый этап, меняющий public contract, сразу обновляет его canonical types, затронутые guide/examples en/ru и generated declarations; эти изменения не откладываются до S9. Каждый этап начинается с наблюдаемого regression/contract test на текущем публичном или внутреннем смысловом seam. Затем минимальное согласованное изменение, удаление superseded пути и адресные проверки. Не заменять поведенческую проверку snapshot текста исходника. Исходные repro могут использоваться для локализации, но окончательная регрессия должна проходить через новый контракт, а не держать удалённые private method names.

### S1. Каноническая конвертация без потери payload

**Зависимости:** нет. **Цель:** I1, P2/P3; C2. **Область:** CanonicalTransforms и все record-assembly consumers в DocumentRuntime.

Доказать failure paragraph+mention → heading; добавить unknown inline, literal collision, частичный/backward/cross range, split и merge. Объединить существующие assembly/remap/filter правила; подключить whole convert первым и завершить остальных callers в этом этапе. Проверить save/load, Undo/Redo и renderer output; отсутствие изменения untouched records. Удалить прежние ручные сборки.

**Завершён:** связанные payload не теряются, literals не связываются, отрицательная конвертация ничего не удаляет; shared schema/declaration и целевые browser conversion tests проходят.

### S2. Атомарная замена документа, история и projection lifetime

**Зависимости:** S1 для canonical candidate. **Цель:** I2/I3/I7, P2–P5; C1 и scope часть C5. **Область:** Store/Engine/History/Reconciler/InlineProjection/runtime render + observer adapters.

Начать future→supported и observer mode repro; добавить supported→future, same-ID replacement, failure create/second update, history.prepare failure и recovery failure. Выделить ingestion; передавать candidate metadata/activation; stage history до commit; внедрить PreparedProjection protocol и scopes до callbacks. Мигрировать event consumers на верхнеуровневые applied changes. ReadOnly/control semantics из C1 проверяются на том же coordinator, не добавлением ещё одной транзакционной системы.

**Cleanup:** удалить mode-after-reset, неодинаковые event branches и unscoped mount. **Проверка:** model/transaction/reconciler tests + public createEditor/render/readOnly/observer integration; async listener rejection и selection revision guards.

**Завершён:** каждая таблица переходов C1 пройдена, no-op/no-failure events корректны, stage failure не оставляет активных signals, failed recovery не разрешает дальнейшие mutations.

### S3. Контракты регистрации и отзыв полномочий расширений

**Зависимости:** S2 lifetime/candidate semantics. **Цель:** I7/I11, P1/P5; C5, локализация C7. **Область:** registry, block/inline contexts, runtime factories, task guards.

Начать stale callback после same-ID render и mutable definition/missing decode repro; добавить staged getData, невызываемый producer после abort, stale inline occurrence, cleanup reentry и async readOnly task. Внедрить snapshot validation и host lease checks; исправить namespace inlinePlugin и проверить реальный ru/en runtime. Обновить plugin-kit contracts и affected built-ins в одном этапе.

**Cleanup:** убрать mutable descriptor retention и дубли namespace. **Проверка:** shared factory conformance, all registered block/inline runtimes, media abort/lifecycle and same-definition reuse tests.

**Завершён:** все обязательные members проверены до setup, истёкшие contexts не затрагивают successor instance; live built-in upload/trigger functionality не регрессирует.

### S4. Один транзакционный путь форматирования и ownership событий

**Зависимости:** S1–S3. **Цель:** I3/I6/I8, P1/P4/P5; C6. **Область:** KeyboardRouter/NativeInput/Selection/InlineToolbar/composition, inline tools types/utils/align и публичные guide.

Начать auxiliary Undo repro и integration test createEditor → selection two fields → toolbar/shortcut. Покрыть два поля одной таблицы, два блока, несовместимое поле, IME и failure второго affected read. Установить guarded edit phase до operation, перевести plugin/single/multi mutation callers, связать tool selection ports в реальной composition, завершить unbind lifecycle. Alignment переводится на tunes command; typecheck TS2554 исправляется удалением старых args. Обновить en/ru guide binding/mutation contract, не отключать doc-contract gate.

**Cleanup:** удалить невключённый параллельный sync algorithm, same-block-only guards и безусловный editor undo для native controls. **Проверка:** typecheck, test:docs, native ownership matrix, physical-history, inline/cross-selection browser tests.

**Завершён:** пользователь может выполнить форматирование через настоящий UI, один Undo его отменяет, ошибка не оставляет DOM/model drift, native auxiliary history работает независимо.

### S5. Версионированный ingress и полная HTML-маршрутизация

**Зависимости:** S1–S3. **Цель:** I1/I3/I5, P1/P2/P5; C3. **Область:** explicit input normalization, HTML import router/capabilities, clipboard подготовка.

Начать p/ul/p с v2 item objects; добавить missing-version serialized v1, explicit current version, text siblings, nested wrappers, ambiguous roots, rejected second block и unsafe HTML. Развести encode/decode inputs, реализовать root consumption и перевести все HTML built-ins на новый contract; text/file tasks сохранить с scoped cancellation. Временный call из старого event adapter допустим только к **единственному новому** importer, без второго HTML алгоритма.

**Cleanup:** удалить #htmlBlockRecords switch и legacy whole-input HTML branches после перевода consumers. **Проверка:** schemas/paste contracts, plugin-source, package types, structured clipboard browser scenarios.

**Завершён:** порядок и содержимое всего HTML сохранены согласно sanitizer policy, невалидный последующий узел не фиксирует предыдущие; no-match и tie соответствуют C3.

### S6. Model clipboard, безопасный Cut и атомарный Paste

**Зависимости:** S1–S5. **Цель:** I1/I4/I5/I6, P1–P5; C4. **Область:** FragmentCodec/Import, Selection transformations, multi-field clipboard exporters, ClipboardController.

Начать частичный formatted Cut и cross-selection private MIME repro. Добавить plain/HTML/private readback failures, selection внутри bold/link, known+unknown inline, два одинаковых IDs из разных parts, malformed v2, absent private support, future dataVersion, mixed whole/partial fragments, per-plugin export table C4 и source-content privacy assertions. Выбранное содержимое экспортируется без невыбранных полей. Все target kinds идут через один prepared insertion. Перевести whole-block MIME path, selection replace и file/text adapters.

**Cleanup:** удалить отдельный application/x-rector-editor path, partial cut только plain, ранний cross-paste fallback и DOM-serialization как источник persisted widget data. **Проверка:** real serializer/importer integration, Cut/Paste one-step history, typed package contracts и browser user gestures между независимыми editors.

**Завершён:** наблюдаемая ошибка записи не удаляет исходник; невалидный/stale insertion оставляет target; смысловая roundtrip матрица проходит, результаты synthetic и system clipboard не смешиваются в отчёте.

### S7. Drag-session без смещения и утечек

**Зависимости:** S2–S4 для lifetime/authority; от S6 не зависит. **Цель:** I7/I9, P3/P5; C7.1. **Область:** DragController и move/view integration.

Начать A/B/C/D вниз и destroy-mid-drag repro. Добавить движение вверх/края/no-op, чужой pointerId, pointercancel, readOnly, same-ID document render, source removal и concurrent reorder. Использовать remaining-order gap и scoped cleanup, максимум один move на завершении.

**Cleanup:** убрать listeners вне scope и бессрочный click swallow. **Проверка:** controller boundary + browser pointer gestures/DOM identity/history.

**Завершён:** ожидаемый порядок во всех позициях, не остаётся listeners/classes/tasks после любого termination; late events инертны.

### S8. Лёгкий query seam без full payload clones

**Зависимости:** S2; выполнять после миграции соответствующих consumers S4/S6/S7, чтобы они не вернули list clones. **Цель:** I10, P3; C7.3. **Область:** Store/internal queries, InteractionState, view/selection/drag/public query adapters.

Начать reconcile instrumentation с большой неизменённой data и ID-only queries. Внедрить metadata query port, заменить подтверждённые full-snapshot reads; внешние snapshots не превращать в mutable aliases. Проверки фиксируют отсутствие payload traversal на ID-only paths, не конкретное количество private calls.

**Cleanup:** удалить обходы list ради ID; не добавлять второй mutable cache records. **Проверка:** существующие 1/100/1000-block fixtures, большой table payload, public snapshot isolation, точечная проекция, bundle budget.

**Завершён:** ID-only consumers не читают untouched data, timing и index-copy overhead честно раздельны, budgets не повышены.

### S9. Паритет, package contracts и финальная архитектурная сходимость

**Зависимости:** S1–S8. **Цель:** I12 и все P/I; §§14–15. **Область:** общие behavioral fixtures, test-only adapters v1/v2, public declarations, docs/examples, standard gates.

Паритетные fixtures добавляются по мере предыдущих этапов, этот этап завершает общую проверку, а не откладывает все тесты на конец. Старая версия используется только тестовым adapter/snapshot исходников на pinned SHA; она не попадает в dist, runtime imports, package dependencies или production switch. Зафиксировать расхождения как баг либо явно одобренное здесь API/placement изменение; не нормализовать пропавший payload или переставленный текст.

Regenerate declarations из canonical sources. Запустить проверенные project commands §14. Проверить source graph: нет private core imports в plugins/renderer, built-in type switches в clipboard, второго mutation/history/keyboard path и stale removed contract usages.

**Завершён:** все acceptance rows доказаны, текущие known gate failures устранены, финальная проверка §15 не содержит материального missing/partial/contradicts/unrequested. Сам факт успешного npm test этого не заменяет.

## 14. Приёмка и уровень доказательств

| Инвариант / сохранение | Обязательные сценарии | Минимальное доказательство |
|---|---|---|
| I1, P2/P3 | Whole/partial/backward/cross convert; split/merge; mention/color/unknown inline; literals+collisions; save/load+undo/redo+renderer | Canonical transform/property corpus + public command/browser integration. |
| I2/I3, P2/P4 | Все mode/readOnly/render/reset/replay переходы C1, same IDs, observer sync/async failure, no-op, fail second projection/history preparation, recovery failure | Transaction+reconciler integration через настоящий DocumentRuntime и public composition. |
| I4/I5, P2/P5 | Форматированный/opaque Cut, readback failure, valid/malformed/private unsupported, p/ul/p и mixed HTML, stale file paste, отсутствие утечки невыбранного content | Codec/import tests + реальные browser clipboard gestures; doubles только для управляемых ошибок. |
| I6/I8, P1/P4 | input/textarea/select auxiliary и registered plain, popup inputs, chrome buttons/links, Ctrl/Meta Z/ShiftZ/Y и beforeinput; real toolbar+shortcut multi-field, alignment, IME | Ownership matrix + public createEditor browser/physical-input tests. |
| I7/I11, P1/P5 | Mutable/accessor definitions, missing decode/default roundtrip, setup/create/update/fields/inline failures, stale contexts и task generations, reentrant destroy | Shared conformance всех factories + lifecycle fault injection + heap/browser gate. |
| I9, P3 | Все drop gaps вверх/вниз, foreign pointer, cancel/destroy/readonly/replacement/reorder, один Undo | Boundary geometry tests + browser pointer gestures и instance identity. |
| I10, P3 | ID-only operations не читают payload, external get/list/save отделены; unchanged blocks не remount; текущие budgets | Instrumented semantic query tests + existing benchmark fixtures + bundle report. |
| I11, P1 | Ru/en реальные labels/mention noResults, одинаковые definitions в разных editors | Runtime composition tests, не только dictionary shape equality. |
| I12, P1–P5 | Все block/tool factories, settings/source/media/poll, lazy imports, native input, renderer/security/TT, package examples | Общая behavior matrix и существующие standard gates, без ослабления старого adversarial corpus. |

Для parity сравнивать видимый/сохранённый текст, marks, payload graph, порядок блоков/полей, selection/focus и количество смысловых history steps. Между независимыми editor instances можно нормализовать случайно созданные первичные ID и save timestamps. Нельзя нормализовать потерю ссылки, unintended aliasing, изменение идентичности внутри одного сценария или пропажу format. Новые API имена и явная политика размещения block fragments в составном поле из C4 фиксируются отдельно как целевые правила, не маскируются под утверждение «байтовая идентичность v1».

Проверенные команды проекта; адресные проверки запускаются внутри этапов, весь набор — после сведения:

```sh
npm run typecheck
npm test
npm run test:docs
npm run test:types
npm run build
npm run test:package
npm run test:browser
npm run docs:check
node benchmarks/bundle-budget.mjs --enforce
```

Если локальная среда не позволяет browser/clipboard, исполнить соответствующий proof в доступном CI на **том же SHA** и указать происхождение результатов. Отсутствие local browser не мешает разработать контракт, но не разрешает отметить непроверенную acceptance row выполненной. Все прежние ожидаемые failures из аудита должны превратиться в проходящие проверки новых смысловых границ; удалённый internal API не считается исправлением без equivalent behavior proof.

## 15. Финальная сверка реализации со спецификацией

После прохождения тестов проследить реальные entrypoints: createEditor → field ownership/selection → gesture → canonical transform → transaction/projection → observer/save/renderer. Проверить также пути setup failure, abort, destroy, render mode boundary и public host mutation в readOnly.

Отклонения классифицировать как `missing`, `partial`, `contradicts`, `unrequested`; исправлять код либо явно пересматривать владеющий нормативный контракт. Удалить unrequested compatibility слои и дубли, не оставлять их «на будущее». Проверить соответствие новых plugin/type/docs contracts действительной composition, а не тестовой сборке с вручную подставленным портом.

Завершение означает отсутствие открытых материальных нарушений I1–I12/P1–P5 и устаревших путей из карты замены. Не означает доказательство отсутствия всех возможных багов, полную security certification или атомарность с системным clipboard за пределами гарантий платформы.
