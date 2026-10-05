# Rector v2 — исправление архитектуры без legacy-совместимости

**Готовность:** `implementation-ready` для разработки, не подтверждение готовности к выпуску.

**Локальная проверка реализации, 2026-10-04:** результаты исправлений и штатных проверок находятся в [актуальном отчёте](RECTOR_V2_LOCAL_VERIFICATION_2026-10-04.md), а возможности каждого из 21 плагинов — в [матрице паритета](RECTOR_V2_PLUGIN_PARITY_2026-10-04.md). Размер ядра исключён владельцем из блокирующих критериев; остальные требования приёмки сохраняются. Проверки включают настоящие мышь/клавиатуру/clipboard Chrome, преобразование каждого rich-text поля составных блоков в обоих направлениях, видимое действие настроек, lifecycle/heap и package consumers. Composition движка Chrome и ручная сессия конкретного IME ОС — разные уровни доказательства; физическая сессия ОС не выполнена.

## 1. Цель, основания и ограничения

Исправить потери содержимого и рассогласование модели/проекции, завершить реальную сборку возможностей v2 и удалить поддержку прежних API и форматов. Результат — один текущий формат, один editing runtime, общие схемы editor/renderer, атомарные операции, явное владение ресурсами расширений и проверяемые пользовательские сценарии.

Основание: [аудит с повторными проверками](RECTOR_V2_AUDIT_RECHECK_2026-10-03.md). Последняя проверка спецификации выполнена на `bf19263b1135745ee4e6a6479597cb2c4e5c0eb4`: относительно `6bd93c5598981e92b2f7fc8142708dc729918990` добавлены только два документа, production-код совпадает. Локально повторены 380 штатных тестов, typecheck, test:docs и 15 адресных assertions; точные результаты и ограничения — в аудите. Исторические воспроизведения с устаревшим JSON подтверждают прежнее состояние кода, но не задают обязательного поведения после отказа от совместимости.

**Уточнённое требование:** обратная совместимость с legacy-кодом, форматами и сохранёнными данными не нужна. Не разрабатывать миграторы, конвертеры старого контента, dual-read/write, fallback «нет версии — значит v1», compatibility flags, старые подписи методов или адаптер v1. Не сохранять такие пути только ради прежних тестов. Существующие данные пользователя автоматически не переписывать; текущая операция — изменение спецификации, последующая реализация изменяет библиотеку, а не внешние хранилища.

Этот документ полностью заменяет предыдущую редакцию плана исправлений. [Первоначальный план рефакторинга](RECTOR_V2_REFACTOR_PLAN.md) — историческое обоснование, не второй нормативный источник для этой реализации. При несовпадении старых тестов/примеров с требованиями ниже изменяются тесты/примеры, а не возвращается старый формат.

### Сохранить

- **P1.** Пользовательские возможности всех 21 block type, 12 default inline tools, inline widgets, renderer, lazy presets, settings/source/media и Poll. Изменение API/JSON не означает удаление самой возможности. Реестры factories остаются каноническим перечнем, новый production-список типов не создаётся.
- **P2.** Сохранность допустимого **текущего** документа: текст, marks, порядок, tunes, inline-связи и неизвестное содержимое незагруженных расширений в явно заданном текущем envelope. Правила неизвестного расширения и несовместимой версии различаются в C0; это не поддержка старых форматов.
- **P3.** Save только из committed model; единые объекты схем editor/renderer; renderer не импортирует editing runtime. Ordinary edit/move/readOnly не пересоздают незатронутые instances.
- **P4.** Native input, IME, logical selection, undo/redo и одна history entry для одного составного жеста. Observer failures не меняют committed state. Change debounce не откладывает persist mutation.
- **P5.** Owner-document/window, sanitization, URL/Trusted Types policy и корректная отмена async-операций. Отказ от legacy не разрешает убрать защиту от unsafe HTML/CSS/URL, прототипов или reentry.

Не добавлять CRDT/OT, новый text engine, framework wrappers, backend persistence, универсальный command bus или вторую history/keyboard систему. Breaking changes в описанных контрактах выполняются сразу с переводом callers, встроенных реализаций, типов и документации; aliases не оставляются.

## 2. Инварианты приёмки

| ID | Требование |
|---|---|
| I1 | Преобразования переносят rich-text и связанную inline-таблицу вместе; литеральные токены не связываются по случайному совпадению ID. |
| I2 | После команды и в post-commit observers модель, проекция, generation, selection/history и доступность взаимодействий согласованы. |
| I3 | Ошибка подготовки не меняет модель/историю; ошибка применения восстанавливает committed projection либо переводит editor в явно failed состояние. |
| I4 | Обнаруженный отказ записи достаточного clipboard-представления не разрешает Cut; Paste валидируется целиком и фиксируется одной операцией. |
| I5 | Принимается только текущий explicit-version формат; local input проходит encode, serialized input — exact-version decode. Старые/неполные формы не угадываются и не мигрируются. |
| I6 | Жест обрабатывает фактический владелец event target; auxiliary native controls не меняют document history/selection по stale range. |
| I7 | Revoked context не вызывает producer/DOM operation и не получает полномочия successor instance с тем же ID; каждый ресурс освобождается одним владельцем. |
| I8 | Форматирование single/multi-field доступно через реальную composition, атомарно и отменяется одним Undo. Alignment существует только в tunes. |
| I9 | Drag считает конечную позицию корректно и освобождает все ресурсы на каждом завершении. |
| I10 | ID-only queries не обходят data/inline незатронутых блоков; внешние snapshots отделены от модели. |
| I11 | Definitions/schema contracts фиксируются и проверяются до setup; все объявившие capability реализации проходят общий conformance; locale namespace один. |
| I12 | Proof проверяет требуемые сценарии и реальные точки сборки, а не только внутренние методы/имена экспортов. Удалённый legacy-контракт не восстанавливается ради зелёного теста. |

## 3. Владение и направления зависимостей

| Владелец | Что принадлежит ему | Что не принадлежит ему |
|---|---|---|
| Shared format/schema boundary | C0: current envelope, exact-version data schemas, JSON ownership, одинаковые validation rules | Миграции, plugin setup, editor DOM/history |
| `DocumentRuntime` | Узкий фасад внутренних команд/запросов, различие host и interaction authority, control state/health | MIME parser, ручные форматы каждого встроенного блока |
| `DocumentStore` / draft | Records/order и committed metadata generation/revision; internal immutable queries и detached external snapshots | UI, clipboard, setup расширений |
| `TransactionEngine` / `HistoryStore` | Единственная prepare/apply/commit/replay orchestration, history cursor и публикация C1 | Чтение всех plugin DOM при save, управление через события |
| `DocumentIngestion` | Нормализация внешнего текущего документа по C0 и registry, prepared candidate | Live mutation, version migration, вызовы observers посреди подготовки |
| `CanonicalTransforms` | Общие assembly/remap/inline-reference правила C2 | История, события, mounted instances |
| `BlockReconciler` / `InlineProjectionRuntime` | Staged projections, active instances, scopes и recovery C1/C5 | Определение формата документа, изменение canonical data через DOM |
| Clipboard codec/import + event adapter | Model fragment, полная preparation C3/C4; adapter только transfer I/O и команда | Legacy MIME, свой persistence/history engine |
| Ownership/selection + UI adapters | Классификация target, logical selection и routing C6/C7 | Mutable block manager для plugins, независимые транзакции для частей одного жеста |
| `ExtensionRegistry` | Snapshot/validation definitions, setup scopes, per-editor styles/localization | Изменение caller-owned definitions, восстановление старых API |

```text
createEditorRuntime -> public facade + interaction adapters
interaction adapters -> DocumentRuntime commands / internal queries
DocumentRuntime -> shared format + ingestion + transforms + transaction/store/history
transaction -> prepared projection port -> reconciler -> registry runtime + scoped context
plugins / inline tools -> plugin-kit + neutral shared contracts, не private core
renderer -> shared format/schema/policies + собственные DOM instances, не editor runtime
```

Выделение Ingestion/Transforms заменяет соответствующие части DocumentRuntime, а не копирует их рядом. File-per-method и дополнительный service locator не нужны. Renderer и editor могут иметь разные представления неизвестного расширения, но одинаковое признание данных допустимыми.

## 4. C0 — единственный текущий формат

### 4.1. Envelope и обязательные версии

Перенести константу формата из private core в нейтральный shared модуль: `DOCUMENT_FORMAT_VERSION = '2.0.0'`. Это версия wire envelope, **не** автоматически подставляемая версия npm-пакета. Патч-релиз библиотеки не меняет формат. Старое внутреннее имя `EDITOR_VERSION` заменяется во всех callers без alias.

```ts
type Json = null | boolean | number | string | Json[] | {[key: string]: Json}
type JsonObject = {[key: string]: Json}
interface EditorInlineWidget {
  type: string
  dataVersion: number
  data: JsonObject
}
interface EditorBlockData {
  id: string
  type: string
  dataVersion: number
  data: JsonObject
  tunes?: JsonObject
  inline?: Record<string, EditorInlineWidget>
  revision?: string | number
}
interface EditorDocument {
  version: '2.0.0'
  time?: number
  blocks: EditorBlockData[]
}
type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object ? {readonly [K in keyof T]: DeepReadonly<T[K]>} : T
```

Эти canonical declarations принадлежат shared/documentTypes; runtime readonly обеспечивается ownership/freeze, не одной аннотацией. Существующие plugin-kit FocusTarget и DataOperationContext переиспользуются по их текущему смыслу: логические field/offset и createId(prefix), без DOM manager.

`version`, block `id`, block/inline `dataVersion` обязательны на serialized границах. `dataVersion` — положительное safe integer; для зарегистрированного типа оно **равно** schema.currentVersion. У части актуальных схем currentVersion сейчас равен 1: само число 1 не означает legacy. Не повышать версии всех плагинов механически и не подставлять версии при чтении. Непустой type/id, уникальные block IDs, dense arrays и JSON-safe object data проверяются до вызовов instance/runtime code. Версия проверяется до decode соответствующей записи; schema callbacks остаются чистыми операциями подготовки, не получают live editor. Optional JSON-поля отсутствуют, а не равны undefined/null; time и numeric revision конечны.

Envelope/record допускают только объявленные ключи; расширяемые сведения находятся в data/tunes/inline. Неподдерживаемые future envelope fields не сохраняются «на всякий случай». `data.align` у Paragraph/Heading, старые string-list items, Table.content, Poll option.votes, старые Gallery layouts и отсутствующие stable subfield IDs отвергаются схемой даже с подставленным текущим dataVersion. Не превращать неизвестную старую форму в допустимую путём молчаливого отбрасывания её полей.

| Вход | Исход |
|---|---|
| `createEditor({data: undefined})` или отсутствие data | Создать новый текущий документ с default block. Это команда создания, не распознавание старого JSON. |
| Явный null, массив вместо document, нет version/blocks | Отклонить; не заменять пустым документом. |
| Envelope version меньше, больше или просто не равна `'2.0.0'` | Отклонить до mount/replace; без relabel, migration и preserved-document mode. |
| Известный block/inline type с отсутствующей или неравной currentVersion версией | Отклонить весь input; не активировать и не сохранять как «валидный неизвестный». |
| Текущий envelope, незарегистрированный type с explicit dataVersion и допустимым JSON | Сохранить как `unregistered` opaque record без запуска его schema/runtime; редактирование внутренних данных недоступно. |
| Невалидная запись после нескольких валидных | Отклонить всю операцию; ничего частично не вставлять/рендерить. |

**Незарегистрированное расширение не является legacy-режимом.** Host знает формат envelope, но не знает семантику data отсутствующего плагина. Такой блок можно сохранить, переместить, удалить и скопировать целиком; нельзя преобразовать или нормализовать его внутренности по соседнему типу. Unknown inline payload остаётся связанным с токеном и инертным. Если в другом editor этот type зарегистрирован, его exact-version schema применяется и может отклонить несовместимый payload. Registry не позволяет dynamic replacement схем в живом editor; новое подключение выполняется новой сборкой.

### 4.2. Схемы без миграций

Оставить один существующий `createVersionedDataSchema`, но удалить legacyVersion/migrations и всю цепочку переходов. Слово versioned обозначает explicit version guard, не поддержку прошлых форм.

```ts
interface BlockDataSchema<D extends JsonObject> {
  readonly currentVersion: number
  createDefault(): D
  decode(input: {dataVersion: number; data: unknown}): {dataVersion: number; data: D}
  encode(data: Readonly<D>): {dataVersion: number; data: D}
  mapRichText?(data: D, transform: (html: string, fieldKey: string) => string): D
}
```

InlineWidgetSchema использует тот же exact-version контракт без mapRichText. Decode сначала проверяет обязательную версию, затем нормализует отделённые данные актуальной схемой. Encode предназначен для актуальных local values. Optional defaults действующего формата допустимы только в самой схеме; старые shape/layout/ID/votes fallbacks не являются defaults. Input/output ownership сохраняет существующие ограничения JSON, включая dense arrays, допустимые prototypes и однократное наблюдение accessor-backed values.

Удалить `DocumentMigration`, `BUILT_IN_DOCUMENT_MIGRATIONS`, `legacyVersion`, `migrations`, `documentVersionPolicy`, глобальный `DocumentMode`, `documentMode`, `preservedTime`, migration diagnostics и `validationMode` preserve/strict из public/config/runtime contracts. Known invalid data всегда отклоняется; поведение unregistered задано выше, а не переключателем. Старые config keys при явной передаче вызывают TypeError, а не молча игнорируются. В типах, examples и generated declarations их нет. Block activation становится `active | unregistered`, без смешения неподключённого плагина и старой версии известной схемы.

### 4.3. Editor и renderer — одна граница

Проверка текущего document envelope и обязательных block/inline метаданных находится в shared, а не только в core. Editor constructor/render, renderer render/renderTo/renderBlock, async presets и clipboard serialized import используют одни правила. Initial composition сначала фиксирует definitions и проверяет candidate, затем приобретает runtime scopes и монтирует detached проекцию; holder заменяется только после успешной подготовки. Ошибка input/setup/mount освобождает приобретённые ресурсы и не очищает прежнее содержимое holder. Для renderBlock применяется shape EditorBlockData; локальные raw `{type,data}` — не обход exact-version validation. Async preset по документу проверяет envelope до imports, загружает доступные объявленные типы и затем exact-validates их data; неизвестные document types оставляет для inert handling. Явный запрос неизвестного имени factory отклоняется. Это не разрешает dynamic registry change у живого editor.

Renderer validates **весь кандидат** перед заменой уже показанного результата. Ошибка позднего блока оставляет предыдущий контейнер и owners; detached частично созданный результат очищается. Отсутствующий renderer может дать инертное представление; существующая renderer-настройка `throwOnUnknown` разрешает вместо него UnknownBlockTypeError. Это политика отсутствующего расширения, не обход проверки версии известного типа.

Не удалять producer revision optimization как «legacy fallback». Для повторного renderTo с тем же renderer-generation/type/dataVersion/revision используется ранее проверенный record и DOM, а не непрочитанное новое data. Контракт продюсера: revision меняется при изменении data/tunes/inline. Первая/изменённая запись всегда проверяется; без revision применяется deep comparison **текущего** формата. Schema/version/renderer replacement инвалидирует reuse. Deep signatures не являются декодером старого JSON.

Ошибочный shape/JSON — TypeError; well-formed неподдерживаемая версия — RangeError. Существующие публичные renderer error wrappers могут сохранять свой тип и cause, но не менять исход «отклонено без partial commit». Validation observer получает content-free reason `invalid-input`, `unsupported-document-version`, `unsupported-data-version` или `invalid-data` после завершения failed preparation; не вызывает mutation посреди проверки. Тексты исключений не используются для распознавания версии регулярным выражением.

## 5. C1 — состояние, транзакции и события

### 5.1. Состояние и полномочия

Store владеет records/order, `generation` полного документа и монотонной committed `revision` (внутренние числа, не serialized producer revision). Runtime владеет `requestedReadOnly` и `health: 'ready' | 'failed' | 'destroyed'`. Глобального editable/preserved state machine больше нет. Block activation определяется наличием registered definition в уже принятом текущем документе.

Public host render/clear/blocks mutations разрешены при requestedReadOnly=true; они не имитируют пользовательский ввод. UI/native/clipboard/plugin mutations запрещены. Public selection-dependent insertInlinePlugin и undo/redo также interaction-bound и недоступны в readOnly. Нельзя держать один assertWritable, одинаково запрещающий host и interaction commands. Синхронная mutation внутри projection/observer callbacks запрещена независимо от host-флага.

Новая generation возникает при успешном render/clear и replay document.replace; undo не возвращает старую generation. Обычные update/move generation не меняют. Каждый новый mounted occurrence имеет новый непереиспользуемый lifetime token. Команда render — **явная замена lifetime даже при равных данных**: это document.replace с одной history entry, не ordinary no-op. Clear аналогично создаёт новый default block. Ordinary update/move/tune без изменения canonical value не создают history/event. Это разграничение устраняет конфликт между «равные данные — no-op» и отменой старых async contexts при render.

| Переход | История и наблюдения |
|---|---|
| Первичная сборка | Пустая history; onReady только после успешного mount. |
| Ordinary составная команда | Одна запись и один committed event; no-op — ни того, ни другого. |
| Host render/clear | Один document.replace; новый lifetime, даже при совпадающих IDs/данных. |
| Неверный формат/версия при render | Прежние model/history/selection/readonly/scopes неизменны; document event отсутствует. |
| Undo/redo | Cursor меняется после успешного replay; новой записи нет; для replacement scopes новые. |
| setReadOnly | In-place контрольная операция; без document history/event и remount, с отменой interaction tasks. |
| Failed apply/recovery | Правила §5.2; никаких ложных committed events. |

Save экспортирует только committed current document и добавляет текущий timestamp time. Время save не влияет на равенство значимых данных/history; вызов save не порождает onChange. После destroy публичные команды/чтения отклоняются, кроме идемпотентного destroy и getters состояния; в failed состоянии допустимы save последней committed модели и destroy.

### 5.2. Один prepared protocol

Расширить существующий projector, не вводить второй runtime:

```ts
interface PreparedProjection {
  apply(): void
  recover(): void
  finalize(): void
  discard(): void
}
```

Prepare получает committed/candidate views, explicit affected records и future generation. Создаёт staged scopes и не уничтожает прежних владельцев, нужных для rollback. Candidate extension context читает candidate record, а не старый block с тем же ID. Stage failures освобождают ресурсы даже до возврата полного PreparedProjection.

Apply вызывает fallible DOM/plugin operations под reentry guard. До commit point подготовить и проверить history record/cursor, detached event и новую Store state. Commit point — синхронная замена подготовленных внутренних значений **без** callbacks, schema/JSON validation или fallible history.push. Нельзя сперва сделать store swap, затем обнаружить ошибку сборки history.

Recover возвращает affected проекции и logical selection к committed state; повреждённый affected instance можно пересоздать, untouched — нет. Discard идемпотентно освобождает неактивированные scopes. После commit finalize отзывает и освобождает superseded scopes; cleanup errors идут в diagnostics, не откатывают commit и не мешают очистке остальных.

Неудавшееся recovery переводит runtime в failed: interactions и mutations/replay заблокированы, save читает последнюю committed модель, destroy остаётся доступным. Не возвращать обычный idle с неизвестным состоянием DOM. Ошибка одного post-commit observer не препятствует другим; sync throw и rejected Promise изолируются действующей observer utility. Payload immutable/detached, чтобы listener не менял данные следующего.

Nested synchronous building operations используют один draft, inner error делает всю outer operation неуспешной даже после catch. Это не разрешение reentry из plugin update/create/dispose или listeners. Deferred focus/selection проверяет generation, committed revision и свой живой scope; callback от Undo не меняет selection более поздней команды.

ReadOnly transition использует тот же guard/prepare/apply/recover принцип для controls и plugin setReadOnly, но не создаёт документную history entry. Requested flag фиксируется после успешного применения; после него синхронно отменяются interaction tasks, обновляются UI guards и публикуются observations. Ошибка transition не публикует новое значение и возвращает старые controls, включая частично применивший режим и выбросивший ошибку экземпляр; невозможное recovery — failed. Guard действует до любого nested producer и beginTask, в том числе из control hooks. Отмена persist-interaction task не отменяет уже committed operation и не отключает runtime-only viewer subscriptions.

### 5.3. Единый контракт событий

```ts
type DocumentChange =
  | {kind:'block.insert'; index:number; block:EditorBlockData}
  | {kind:'block.remove'; index:number; block:EditorBlockData}
  | {kind:'block.update'; id:string; before:EditorBlockData; after:EditorBlockData}
  | {kind:'block.move'; id:string; from:number; to:number}
  | {kind:'document.replace'; before:EditorDocument; after:EditorDocument}
interface TransactionCommitted {
  sequence: number // committed revision документа
  origin: 'user' | 'native-input' | 'plugin' | 'external' | 'history'
  action: 'commit' | 'undo' | 'redo'
  name: string
  changes: readonly DocumentChange[]
  history: Readonly<{canUndo: boolean; canRedo: boolean}>
}
interface EditorEventMap {
  'editor:ready': undefined
  'editor:destroyed': undefined
  'transaction:committed': DeepReadonly<TransactionCommitted>
  'document:changed': DeepReadonly<Pick<TransactionCommitted,'origin'|'action'|'changes'>>
  'history:changed': Readonly<{canUndo:boolean; canRedo:boolean}>
  'readOnly:changed': Readonly<{readOnly:boolean}>
  'currentBlock:changed': Readonly<{currentId:string|null}>
  'selection:changed': Readonly<{selectedIds:readonly string[]}>
}
```

DocumentChange — существующие insert/remove/update/move/document.replace; changes всегда верхнеуровневые. Undo публикует **фактически применённые inverse changes в порядке применения**, redo — forward. `record` не публичен; `reset` и document-mode поля удалены, поскольку их единственная текущая причина — несовместимый формат. Private clear-history helper допустим только при существующей собственной ответственности, а не как второй replacement path.

Типизированный EditorEventMap задаёт `on<K extends keyof EditorEventMap>(type: K, listener: (value: EditorEventMap[K]) => void | Promise<void>): () => void`. Сохранить имена transaction/document/history/readOnly/currentBlock/selection/ready/destroyed, обновить payload contracts. document:changed получает `{origin, action, changes}` из того же event. canUndo/canRedo учитывают readOnly/health. setReadOnly публикует readOnly:changed и history:changed только после фиксации control state, без transaction/document event. Удалённый documentMode не возвращается константой «editable» ради compatibility.

ChangeNotifier остаётся post-commit debounced observation. Validation errors и diagnostics не являются управляющими событиями для history. Listener может поставить новую команду в очередь после текущего вызова, но не вложить mutation в синхронную публикацию.

## 6. C2 — канонические преобразования

```ts
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

Discriminant kind принадлежит внутреннему input API, не persisted JSON. Local input всегда registered/current и проходит encode. Serialized input проходит C0/exact decode; нет missing-version fallback. Два входа дают один prepared canonical candidate. Public insert с отсутствующей data явно вызывает schema.createDefault; это не permission decode старую форму.

CanonicalTransforms объединяет existing assembly/remap/filter helpers. Convert, partial/cross convert, split/merge, fragment insertion и projection commit не собирают вручную разные варианты next record.

1. Все schema-declared rich-text поля проходят один codec; Code/Raw/plain-text не объявляются rich-text ради generic обработки. Runtime metadata не попадает в data.
2. `{{id}}` — reference только при собственном sidecar entry; без entry это литерал. Known inline type проверяется exact schema; unregistered JSON-safe payload остаётся инертным. Источником payload никогда не служат HTML data-* атрибуты.
3. У изменённого active block переносить все использованные ссылки и удалять неиспользуемые sidecar entries. У unregistered whole block data не интерпретировать и не prune по неизвестной схеме.
4. Перед объединением зарезервировать связанные ID **и литеральные токены** всех источников/приёмника. При коллизии remap только связанные occurrences конкретного source; одинаковая строка в разных источниках не означает один payload.
5. Whole conversion сохраняет block ID/tunes/связанный inline; split выдаёт новые block IDs только новым частям; move не меняет payload/revision. Copy/Paste выдаёт новые block IDs. Внутренние item/cell IDs имеют declared block-local namespace: копирование в новый блок само по себе не требует их глобальной уникальности, объединение в один namespace устраняет коллизии.
6. Session allocator не переиспользует выданные им ID. Схемные defaults с block-local `item-0` не являются восстановлением старых данных. В serialized input отсутствие обязательного ID — ошибка, не повод вызвать allocator.
7. Изменение data/tunes/inline удаляет заимствованный producer revision; оставлять прежний revision после изменения смысла нельзя. Registry и transforms не вычисляют внешний revision за продюсера.
8. Неподдерживаемая conversion отклоняется до удаления. Explicit non-text conversion — отдельная пользовательская операция с описанной заменой выделенного интервала, не fallback для ошибки Paste.

Logical coordinates используют единицы существующего shared/textOffset/richText codec: UTF-16 text offsets и атомарную длину widget. В direction/backward handling и line breaks нет второго приблизительного подсчёта через textContent. Save/load, Undo/Redo и renderer получают один и тот же граф ссылок.

**Согласованное отличие от v1, 2026-10-04.** При преобразовании целого составного блока в текст сохраняются авторские текстовые поля: в том числе подпись Quote, имя/роль/биография Person, вопрос и все варианты Poll. Восстанавливать прежнее отбрасывание этих полей нельзя. Это решение владельца, а не случайное расхождение, которое следует скрыть в сравнении. Изображение или проигрыватель при явной whole-conversion в текст заменяется текстовым представлением; операция не обещает сохранить медиа как медиа в Paragraph. Markup и связанные inline payload не должны теряться при поддерживаемом импорте цели.

**Явное преобразование типа, 2026-10-05.** Оба меню используют один logical selection command: частичное выделение не означает замену всего блока. Все зарегистрированные типы доступны для явной замены: принимающая цель импортирует payload, остальные получают schema defaults. Группировка межблочной замены задаётся отдельным `conversion.selectionMode`, а не проверкой `canImport` для пустого rich-text payload. Режим `single` (по умолчанию) создаёт один default-блок на весь выбранный интервал; `per-block` импортирует отдельные фрагменты. Image/Embed и составные цели используют `single`, даже если могут импортировать текст в подпись/поле. Paragraph/Heading/List/Quote/Checklist/Code используют `per-block`; Raw принимает только plain text и сохраняет прежний режим `single` для rich-text диапазона. Реестр валидирует и неизменяемо сохраняет режим; в ядре нет списка имён плагинов. Gallery/Carousel экспортируют подписи, но не заявляют импорт текста, который не создаёт медиа. Whole conversion сохраняет ID/tunes; проверка сохранения связанных inline references выполняется до замены. Это пользовательское преобразование, а не fallback неподдерживаемого Clipboard payload.

**Поведение тюна после Move.** Меню остаётся открытым, заново строит действия с текущими границами Up/Down и сохраняет авторский logical bookmark. Кнопки добавления/тюна и открытое меню позиционируются по движущемуся блоку до завершения анимации; на Hide/readOnly/destroy кадровая подписка снимается. Активный тип в conversion view не блокируется для межблочного выделения.

**Частичное преобразование составного блока.** Когда диапазон оставляет невыделенные поля или части поля, owning capability готовит один остаточный исходный блок с прежними block/item/cell IDs, настройками и медиа. Выбранный текст становится целевым блоком после остаточного владельца; при пустом остатке цель занимает исходное место. Этот порядок соответствует v1 `splitConvert` для List. Нельзя создавать две копии Gallery/Person/Table ради prefix/suffix и тем самым дублировать принадлежащие им assets. Локальный простой текстовый блок сохраняет обычный порядок prefix/target/suffix; cross-block преобразование сохраняет первый prefix перед целями и последний suffix после них. Каждый путь имеет один Undo/Redo с восстановлением направленного исходного диапазона.

## 7. C3 — текущий ingress и структурная HTML-вставка

Подготовку отделить от фиксации. Local constructors/HTML import не вызывают external decode; serialized document/fragment не попадают в encode как доверенный local input. Удалить двусмысленное использование insertExternalBlocks для обоих источников, заменив normalize-input + insert-prepared.

Добавить к BlockCapabilities `htmlImport?: HtmlImportCapability<D>`; убрать kind:html из прежнего PasteInput.accepts/resolve после перевода всех HTML consumers:

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

Input разбирается в inert detached template и проходит существующую **структурную** HTML policy, сохраняющую допустимые headings/lists/tables/media; inline-only sanitizer до выбора roots использовать нельзя — он уничтожил бы структуру. Затем каждое импортированное rich-text поле проходит обычный rich-text codec. Никакого параллельного более мягкого allowlist. Event adapter не вставляет произвольный HTML через unprotected sink.

Capability синхронна, без side effects; matchesRoot проверяет предложенный root, не найденный где-то descendant. importRoot возвращает current local data **этого type** и потребляет весь root. Ошибка принятого root отклоняет весь план, не запускает следующий resolver после partial effect.

Router обходит все nodes в DOM-порядке, включая text siblings. Matched root не обходится повторно как независимые дети. Unsupported structural wrapper раскрывается обходом детей; смежные inline/text nodes с marks группируются в rich-text segment. Core не содержит таблицы paragraph/heading/list/quote shapes. Tie: сначала capability текущего target type, затем порядок registration; один root разрешается один раз.

Unmatched безопасное содержимое даёт neutral payload `{kind:'rich-text', data:{text: html}}`. При необходимости нового блока оно материализуется conversion capability default block; если она не принимает payload — первым зарегистрированным accepting type. Если такого нет — unsupported без удаления selection. Нельзя превращать active/неизвестный HTML в raw block, обходя sanitizer.

Text/file routing сохраняет собственную ответственность: первый accepts=true (target type, далее registration order), один resolve. Resolve=null означает unsupported; fallback plain text допустим при отсутствии подходящего accepts, не после ошибки принятого resolver. Async resolution выполняется до transaction в task scope C5, без автоматических retries или второй попытки через другой provider. Результат целиком проверяется до первой mutation.

`p + ul + p`, nested wrappers и текст между roots сохраняют порядок/содержимое без потерь и дублей. Старые **Rector** embedded JSON/data-value не импортируются. Обычный внешний HTML/plain text остаётся функцией editor, а не legacy JSON compatibility.

## 8. C4 — clipboard-фрагмент и составное выделение

### 8.1. Формат и приоритет входов

Единственный private MIME — `application/x-rector-fragment` с **version: 2**:

```ts
interface TransferBlock {
  type: string
  dataVersion: number
  data: JsonObject
  tunes?: JsonObject
  inline?: InlineMap
}
type FragmentPart =
  | {kind: 'rich-text'; html: string; inline?: InlineMap}
  | {kind: 'block'; block: TransferBlock}
interface ClipboardFragment {
  version: 2
  parts: readonly FragmentPart[] // dense/non-empty, в порядке содержимого
}
```

Block ID и producer revision при переносе отсутствуют; receiver создаёт новые block IDs. TransferBlock — отдельный текущий transfer envelope: отсутствие id здесь предписано контрактом, в отличие от EditorBlockData. Receiver сначала проверяет весь TransferBlock и exact dataVersion, затем выделяет новые IDs и строит canonical records. Правила JSON и текущих версий C0 сохраняются; документ с отсутствующим id через этот путь не принимается. Каждый part имеет свой namespace ссылок. Source records с невыделенным содержимым и будущие неизвестные envelope fields не добавляются. Валидатор private MIME считает input внешним, даже если его создал другой Rector.

Если **этот MIME присутствует**, он должен полностью пройти validation текущей версии; ошибка/другая версия отклоняет Paste до удаления. **Не делать fallback к HTML/plain при явно невалидном или несовместимом private fragment.** Это исключает скрытое восстановление старого формата и потерю metadata. Когда текущий private MIME отсутствует: files → HTML C3 → plain text. Старый application/x-rector-editor не читается и не распознаётся; независимые стандартные HTML/text representations могут обрабатываться обычным внешним importer, без извлечения старых Rector payload.

Valid fragment с unregistered type сохраняется whole/inert; если конкретный target не может безопасно его вставить, unsupported без lossy fallback. Поведение одинаково для collapsed, single-field, cross-field и whole-block selection. Нет раннего cross-paste обхода private MIME.

### 8.2. Единый slice для Copy, Cut и удаления перед Paste

Private fragment строится из canonical model и logical selection. Полный блок экспортируется как TransferBlock; single rich-text field — codec slice с surrounding marks/sidecar, даже если DOM Range.cloneContents вернул только text node. Widgets — атомы; границы нормализуются к атомам, половина payload не экспортируется.

Для составных блоков добавить одну чистую `BlockCapabilities.clipboard` capability, которая **одновременно** определяет экспорт и остаток, а не оставляет core угадывать устройство data:

```ts
interface SelectedFieldSlice {
  fieldKey: string
  before: string
  selected: string
  after: string
  whole: boolean
}
interface ClipboardSliceContext extends DataOperationContext {
  field(fieldKey: string): SelectedFieldSlice | null
}
interface ClipboardSlice<D extends JsonObject> {
  parts: readonly ({kind:'local-block'; data:D} | {kind:'rich-text'; html:string})[]
  remaining: D | null
  focus: FocusTarget | null
}
interface ClipboardCapability<D extends JsonObject> {
  slice(data: Readonly<D>, context: ClipboardSliceContext): ClipboardSlice<D>
}
```

Context содержит только пересекающиеся поля в model logical order; null — поле не выбрано. Local-block всегда type текущей definition. Core encode/validate результата и C2 sidecar-remap обязательны до mutation. Copy использует parts; Cut и replacing Paste используют **remaining того же slice**. Focus обозначает collapsed caret после удаления; отсутствие remaining означает удаление owning block. Чистый slice не меняет источник, даже если используется только для Copy.

Simple single-field slicing может быть generic по schema/codec. Multi-field built-ins реализуют capability; отсутствие capability для сложного partial selection означает unsupported **до** Copy/Cut mutation, не экспорт целого source. Существующая selectionSlice отвечает за отдельную семантику conversion с before/after блоками; она использует те же field slices/C2, но не становится вторым DOM-cut алгоритмом. Это разные data-результаты, а не две реализации clipboard history.

| Источник | Частичный экспорт | Remaining |
|---|---|---|
| Одно простое rich-text поле | Selected HTML с marks/inline | Before+after в прежнем поле; остальные data/tunes неизменны. |
| List/Checklist, несколько items | Блок того же типа с пересекающимися items; обрезать endpoints, сохранить style/checked выбранных items | Удалить whole-selected items, обрезать endpoints; обеспечить действующий default-empty invariant. |
| Table, несколько cells | Минимальный прямоугольник выбранных cells; невыбранные ячейки внутри него пустые; endpoints обрезаны | Сетка и невыбранные значения неизменны; удалить только выбранные интервалы. withHeadings при экспорте true только если включён исходный heading row. |
| Columns, несколько fields | Тот же layout; невыбранные поля пустые, без их текста | Layout/невыбранные fields сохранены. |
| Quote/Warning/Toggle/Spoiler, несколько fields | Local block с выбранными slices; невыбранные текстовые поля — defaults, структурные флаги сохранены | Невыбранные значения сохранены; очистить выбранное. |
| Медиа caption | Rich-text part без невыбранных URL/медиа | Меняется только caption. |
| Обычный range в native plain-text control | Native clipboard; core не превращает его в structural block fragment | Обычное native удаление и canonical input sync. |
| Unregistered block | Только whole TransferBlock, без интерпретации data | Whole removal по interaction authority. |

Сначала рассчитать весь slice/fragment/remaining, затем фиксировать. Не переносить невыбранные field contents «для последующего slicing у получателя». Full-block selection выражается явным списком IDs, а не требует editable endpoints у первого/последнего блока: документы с Image/Delimiter/unregistered на границах также копируются/вырезаются целиком.

### 8.3. HTML/plain representations и Cut

Один serializer формирует `{fragment, html, text, requiresPrivateFormat}` для Copy и Cut. Private payload — из модели. HTML/text fallbacks могут использовать **только безопасную отображаемую проекцию выбранного диапазона**, без восстановления data из widget DOM; codec сохраняет author marks, source selection/revision фиксируется. Для whole known blocks исключаются toolbar/native controls и невыбранные сведения; unregistered block даёт inert placeholder, не вставку raw data. Любой inline sidecar или составной/нетекстовый block part требует private representation для обратимого переноса.

Lossless export требует selection, разрешимой в committed model, и соответствующей ей проекции. Во время незавершённого IME нельзя принудительно коммитить промежуточную composition ради Cut: destructive structured Cut отклоняется. Несинхронная projection не используется как доказательство lossless Copy; обычный native Copy может остаться браузеру, но не считается canonical fragment export.

При перехвате Cut сначала preventDefault; затем в рамках event handler записать text/plain, text/html и private MIME, проверить доступные types/readback. Ошибка обязательной записи означает clipboard-write-failed без model/history/selection change. Text-only fallback недостаточен для rich/opaque содержимого. После записи перепроверить generation/revision/selection lease: устаревшая selection не удаляется. Если запись завершена, а document transaction отвергнута, безопасный исход — скопировано, но не удалено.

По [W3C Clipboard API and events, Working Draft 24 June 2026](https://www.w3.org/TR/2026/WD-clipboard-apis-20260624/), clipboard events не дают durable acknowledgement общей транзакции с ОС; synthetic events не меняют системный clipboard. Гарантия выше относится к обнаруживаемым отказам event boundary. Не обещать доказанную доставку произвольного MIME платформой по одному успешному setData/readback. Real browser Copy/Cut/Paste между независимыми editors — отдельная acceptance proof. Неподтверждённая передача private MIME не превращается в «полный паритет»; ограничения платформы фиксируются явно. Async writeText не подставляется молча вместо lossless protocol.

### 8.4. Одна команда применения

`PreparedInsertion` привязан к captured generation/revision/selection и anchors. Перед commit проверяется актуальность; obsolete target — stale-target без побочного эффекта. Removal+insertion+ID remap+selection происходят одной C1 операцией; отдельный Paste/Cut не coalesce с соседним typing.

- Один rich-text part заменяет диапазон в том же rich-text field; не меняет type/остальные поля.
- Смежные rich-text parts объединяются одним codec-normalized `<br>`, сохраняя раздельные source namespaces до remap.
- Whole-block selection заменяется ordered part blocks; rich-text materializes по C3. Невыбранные records/instances сохраняются.
- Block parts в простом текстовом block располагаются между left/right remainders; пустой заменяемый target не оставляет лишнего пустого блока.
- Внутри одного составного owning block применяется slice.remaining, а вставляемые block parts располагаются сразу после surviving owning block. Это явная семантика плоской block model, не fallback после partial failure. Nested block JSON не внедряется в field.
- Между разными блоками сохранить left endpoint remainder, вставить parts, затем right remainder; whole interior blocks удалить. Один составной owner не дублируется.
- Объединение текстовых остатков допускается только заявленной lossless merge/conversion capability; иначе оставить отдельными. Фокус после Paste — конец вставки, после Cut — начало удалённого интервала. При пустом документе создаётся один default block.

Prepared selectionAfter входит в history operation; не захватывать случайный toolbar range до окончательного placement. Реальная восстановленная selection может дополнительно стабилизироваться microtask с revision/lifetime guard C1.

## 9. C5 — definitions, scopes и async tasks

### 9.1. Snapshot/validation

Registry snapshot всех используемых descriptor members → validation → setup. Caller-owned definition/schema/capability metadata не остаётся mutable authoritative object. Accessors наблюдаются один раз; methods вызываются с зафиксированным receiver. Snapshot фиксирует dispatch metadata и ссылки методов, но не произвольное mutable состояние замыкания extension code. Каждый encode/decode result дополнительно сверяется с захваченным currentVersion и JSON-контрактом: внешняя мутация не может незаметно изменить формат или dispatch identity. Не замораживать объекты пользователя. Immutable shared schema object можно переиспользовать без изменения identity; mutable descriptor требует host-owned immutable wrapper, не вторую независимую схему.

Проверить dense registration arrays, unique type, defaultBlock, currentVersion, createDefault/decode/encode/setup и заданные optional members. Defaults toolbox-insertable blocks проходят encode+exact decode с равным canonical result. MapRichText требуется только для declared rich-text capability. `legacyVersion`/`migrations` не являются проверяемыми обязательными members: их больше нет; явно переданные старые options отклоняются до setup.

Начатое acquisition style/runtime немедленно входит в LifecycleScope. Error setup/create/fields/setReadOnly/inline hydration освобождает всё приобретённое в обратном порядке. Даже invalid returned instance должен быть уничтожен, если его корректный destroy уже получен. Исключение одного dispose не мешает остальным.

### 9.2. Revocable instance context

Состояния scope: `staged -> active -> revoked`; включает generation, mount token, blockId/type и inline occurrence identity/field. Staged getData читает candidate, isReadOnly — значение control state подготавливаемой проекции; persist mutation в staged запрещена. Active getData даёт отделённый глубоко неизменяемый snapshot актуальных данных своего occurrence; peek Store к plugin не передаётся. Перед producer или DOM callback проверить lease, authority, phase, health. Проверка после вызова producer недостаточна.

После revoke mutation callbacks — no-op без вызова producer/operation; getData/createId бросают AbortError, isReadOnly=true. Conversion/removal/replacement/destroy отзывают прежние scopes. Undo и same-ID render не оживляют их. Reentry из prepare/apply/recover/publishing — error до callback, даже у active scope. Scope destroy **сначала** отзывает полномочия, **потом** запускает dispose.

Block и inline mount приобретают scope до первого extension callback. Только успешный stage передаёт ownership PreparedProjection, commit активирует новый scope. ReadOnly не пересоздаёт instance scopes. Уже закоммиченное действие не отменяется задним числом.

### 9.3. Async task contract

Instance signal недостаточен для операции, которая должна отмениться на readOnly true→false, сохраняя сам instance. Добавить в BlockInstanceContext и InlineWidgetContext один явный task scope:

```ts
interface DataTask<D extends JsonObject> {
  readonly signal: AbortSignal
  commit(producer: (current: Readonly<D>) => D): boolean
  cancel(): void
}
// beginTask() создаётся до async работы; вызов при readOnly/revoked отклонён.
// BlockInstanceContext<D> и InlineWidgetContext<D>:
// beginTask(): DataTask<D>
```

Task принадлежит host scope, захватывает generation/occurrence и interaction epoch. Закрывается при parent revoke, readOnly transition, явном cancel или успешном commit. Host не угадывает settlement произвольного Promise: незавершённый task caller закрывает в finally. Commit проверяет task/parent/phase перед producer; возвращает false без его вызова при отмене/устаревании. Первый успешный commit закрывает task, повторный commit=false; validation error закрывает task и не меняет документ. Caller после завершения без commit вызывает cancel в finally; это не автоматический retry. Независимое редактирование того же живого блока не отменяет task: producer получает latest data и обязан не перезаписывать unrelated fields старым полным snapshot.

Все встроенные async upload/source-resolution/inline completion callbacks переходят на захваченный task, а не напрямую на retained updateData. Parallel request ordering внутри одного plugin дополнительно обеспечивает его существующий request serial; task API не выбирает победителя разных запросов за plugin. Core clipboard/trigger имеют task scope того же LifecycleScope механизма с captured selection lease C4, а не публичные права на чужой block через DataTask.

DataTask предназначен для persist mutation автора. Runtime-only результаты/subscriptions Poll и допустимые read-only media interactions сохраняют собственный lifecycle; не превращать их в persisted authoring commands и не отключать всё асинхронное поведение viewer при readOnly.

Это защита от ошибочных/stale callbacks доверенного extension code, не sandbox от произвольного same-origin JS. Host не может вывести происхождение произвольного позднего DOM callback: asynchronous работа обязана использовать данный task contract.

## 10. C6 — ownership и форматирование

### 10.1. Владелец target до shortcut

```ts
type InteractionOwner =
  | {kind:'document-rich-text'; blockId:string; fieldKey:string}
  | {kind:'document-plain-text'; blockId:string; fieldKey:string}
  | {kind:'auxiliary-native'}
  | {kind:'editor-chrome'}
  | {kind:'outside'}
```

Основание ownership — точная регистрация EditableField в reconciler и current editor/popup scope. Ближайший nested input/textarea/select или независимый editing host без этой регистрации — auxiliary-native; ancestor contenteditable/data-block-id сам по себе прав не даёт. Использовать composed event path для nested/shadow targets, не stale selection другого editor.

KeyboardRouter до Mod+Z/Y и inline shortcuts выполняет classification. Auxiliary/outside сохраняют native behavior без preventDefault/document commands. Registered plain-text получает canonical history, не rich formatting. Editor-chrome buttons/links могут вызвать document history; input в popup остаётся auxiliary. Retained range для toolbar используется только по editor-chrome gesture с живым lease.

Keydown и beforeinput historyUndo/historyRedo согласованы и не исполняют команду дважды. IME/isComposing/keyCode229 не запускают structural/formatting shortcut. ReadOnly подавляет только persist interactions редактора, не Copy и не самостоятельные действия auxiliary controls.

Mod shortcuts используют physical `KeyA/B/Z/Y` (fallback key только при отсутствии подходящего code), сохраняя работу на русской раскладке. Цикл Ctrl+A сверяется с v1: collapsed непустой host → native text; уже непустой range либо пустой host → whole blocks; следующий Ctrl+A снимает whole intent и возвращает native field selection. Plain-text Code hosts участвуют в whole selection, даже если rich-text hosts в документе нет.

Clipboard Copy/Cut/Paste классифицирует текущий composed event target до retained range. Auxiliary inputs сохраняют собственный native clipboard и не экспортируют document fragment. Активный cross range удаляется целиком Backspace/Delete, включая Mod+word deletion и keyless beforeinput delete ingress.

Local private rich paste в зарегистрированный plain-text host выполняется native plain-text путём. Cut/Paste/Drop имеют отдельный смысловой history step между typing groups. Для native input, требующего замены projection, post-input fieldKey/offset захватывается до reconciliation и входит в selectionAfter; после commit сохраняется DOM focus в том же авторском поле. Async rich paste возвращает caret именно в выбранное поле составного блока, а не в его первое поле.

Публичный blocks.select задаёт явный whole-block intent; команды Delete/type/clipboard/IME используют выбранные IDs в document order и сохраняют невыбранные gaps. Render generation отзывает intent при повторном использовании IDs. IME preedit не меняет canonical данные/историю; commit выбранных rich/plain блоков является одной операцией. Slash, inline insertion/edit и все clipboard commit paths готовят caret-after в той же транзакции, чтобы Redo восстановил целевой host/offset.

Доказательства этого поведения и red/green witnesses: [RECTOR_V2_CORE_PARITY_2026-10-04.md](RECTOR_V2_CORE_PARITY_2026-10-04.md).

### 10.2. Один protected projection edit

На время DOM-обработчика и подготовки его данных действует единая защита от повторного входа: вложенные persisted commands и mode transitions отклоняются до producer. Ошибка чтения/валидации восстанавливает committed projection без нового history step; отказ этого восстановления переводит runtime в failed, оставляет committed save доступным и сохраняет обе причины в AggregateError.

```ts
interface LogicalPoint {blockId:string; fieldKey:string; offset:number}
interface LogicalBookmark {anchor:LogicalPoint; focus:LogicalPoint}
type DocumentSelection =
  | {kind:'range'; bookmark:LogicalBookmark}
  | {kind:'blocks'; ids:readonly string[]}
interface ProjectionEditRequest {
  blockIds: readonly string[]
  origin: 'user' | 'native-input' | 'plugin'
  name: string
  selectionBefore: LogicalBookmark | null
}
// Только internal port, не public app/plugin manager:
// runProjectionEdit(request, operation: () => void): void
```

DocumentSelection — внутренний выбор диапазона или whole blocks, не поле persisted JSON. Selection owner выдаёт lease с собственной монотонной ревизией логического выделения; очистка/смена диапазона/новый выбор отзывает прежний lease даже при последующем возврате к тем же координатам. Toolbar переносит прежний живой lease, а не считает focus в своей кнопке новым document selection.

Guard/lifetime/authority и recovery baseline фиксируются **до operation**. Callback выполняется синхронно в guarded phase; считываются только affected registered fields, затем C2-normalize и одна C1 transaction. Error operation/read/encode восстанавливает committed projection/selection без history change. Before bookmark снимается до operation; after bookmark — после DOM operation до применения подготовленной проекции, которая может пересоздать hosts. Отсутствие явного selectionAfter не разрешает потерять конечную каретку при commit/Redo. Async/thenable return отклоняется как нарушение контракта; deferred plugin DOM operations не становятся разрешённой частью транзакции. Никакой поддержки старого async mutation API.

Plugin commitDomMutation ограничен своим block ID и делегирует этому seam. Inline formatting может охватывать несколько fields в одном block и нескольких blocks. Native input, уже изменивший DOM браузером, имеет явный ingress в тот же normalize/commit/recovery путь; IME не коммитится на каждом compositionupdate и не ждёт save/debounce. Single/multi syncBlocksFromProjection не остаются разными orchestration implementations.

### 10.3. Реальный binding и selection direction

CrossEditableSelectionPort: readonly range (detached Range snapshot), `activate(range: Range): boolean`, `deactivate(): void`. InlineTool.bindSelectionPort принимает port либо null. Activate принимает noncollapsed selection нескольких rich-text fields, **в том числе одного блока**; same-block-only guard удаляется. Direction берётся из сопоставленного native anchor/focus или явно сохранённого logical bookmark текущей selection, не из несвязанной предыдущей selection. Range сам по себе не кодирует backward direction. Whole-block selection не имитируется Range с отсутствующими editable endpoints.

Composition связывает все configured tools до использования, регистрирует unbind(null) и отзывает port при destroy. Mutable tool instance принадлежит одному editor; simultaneous reuse отклоняется, фабрики создают независимые экземпляры. Manual bind в unit fixture не заменяет тест createEditor.

Eligibility определяется по всем выбранным rich-text owners: tool доступен, только если capability есть у каждого. Mixed plain/opaque selection не форматируется частично «где получилось». Toolbar click/shortcut используют один resolved selection и одну protected edit; ошибка второго поля восстанавливает первое. Before/after history bookmarks соответствуют пользовательскому результату.

Alignment изменяет только tunes выбранных уникальных block IDs одной командой. Context tools получает `setTextAlign(value: 'left'|'center'|'right'|'justify'|null): void` и `getTextAlign(): 'left'|'center'|'right'|'justify'|'mixed'`; отсутствие tune читается как left, null очищает. Align не сериализует wrapper CSS в data.align. ClearFormatting снимает character marks выбранного интервала; block alignment снимается явным align reset.

У inline-tools удалить private core imports и угадывание первого поля через legacy/synthetic range fallback. Нейтральные DOM/icon helpers перенести в shared/plugin-kit один раз; core selectors/manager lookup не экспортировать вместо нового port. Реальные callers/types/docs меняются вместе, ошибки TS2554 не скрываются лишними optional args или any.

## 11. C7 — drag, запросы, локализация и пределы

### Drag

Одна pointer-сессия editor, конкретный pointerId/source lifetime. Placement вычисляется по order **без dragged ID**, как gap/beforeId/afterId; затем переводится в конечный нулевой индекс move. A/B/C/D, gap между B и C → B/A/C/D. Pointermove меняет preview, не документ; pointerup фиксирует максимум одну move/history entry. Чужой pointerId игнорируется.

Cancel/destroy/readOnly/replacement/source removal/concurrent reorder отменяют stale session. Scope освобождает document listeners, pointer capture, classes/preview/spacer и click suppression. Последний ограничен данным gesture, не ждёт произвольного будущего click. Late pointerup не выполняет move/focus. Instances/DOM identity сохраняются.

### Internal queries

```ts
interface DocumentQuery {
  readonly size: number
  has(id: string): boolean
  idAt(index: number): string | undefined
  indexOf(id: string): number // -1, если нет
  ids(): readonly string[]
  peek(id: string): DeepReadonly<EditorBlockData> | undefined
}
```

Readonly здесь означает недоступность изменения Store, а не только TS-аннотацию. Invalid idAt index → undefined. Public get/list/at/save остаются detached snapshots; peek не попадает к plugins/app observers. InteractionState/ViewModel/selection/drag/public count используют metadata, не `list().map/findIndex`. has/idAt/size/peek не читают payload; indexOf/ids могут обходить order, но не data/inline. Не создавать второй mutable cache document data.

O(N) shallow index copying draft/commit пока допустим; не объявлять всю операцию O(1) и не вводить persistent tree/rope только ради этого замечания. Считать отдельно payload reads/clones, touched projections и measured timing. Текущие gzip budgets **51/40/64/96 KiB** (core/paragraph/defaultInteractive/fullPreset) не увеличивать для прохождения плана. По прямому решению владельца от 2026-10-04 размер ядра является информационной метрикой и не блокирует завершение; ограничения paragraph/defaultInteractive/fullPreset остаются обязательными.

### Locale и security

Runtime locale keys: block `plugin.<type>.*`, inline **`inlinePlugin.<type>.*`**. Ошибочный `inline.*` alias и full-key compatibility bypass ScopedI18n не сохраняются. Registry t() — единственный extension-facing scoped путь; если ScopedI18n/scope не имеет действующих consumers, удалить его, не оставлять второй механизм. Проверяется реальная ru/en composition, а не только совпадение dictionary trees.

Удалить old widget HTML-recovery allowance (`data-value` и перенесённые data-inline markers) из **внешней serialized/clipboard** sanitization boundary. Текущая host-created live projection может иметь собственные markers: перед нормализацией она преобразуется в canonical placeholders через registered occurrence ownership, не decoder старой HTML-формы. Подделанный внешний marker не создаёт widget. Не удалять защиту от `expression()`, опасных URL или XSS на основании слова legacy в комментарии.

Браузерные feature-detection adapters вроде caretPositionFromPoint/caretRangeFromPoint, обычный HTML/text import, deep-signature path без producer revision и schema.currentVersion=1 сами по себе не являются compatibility с v1 Rector. Удаление определяется ответственностью, не grep по слову legacy.

Diagnostics content-free; retries, timeout/retention, latency SLA не придумываются. Invalid input, unsupported target, stale-target, cancelled и clipboard-write-failed различаются в internal adapter outcome; не протекают как unhandled rejection и не запускают скрытую вторую mutation.

## 12. Изменяемые источники и удаления

Проверенные existing paths ниже; новые shared/ingestion/fragment paths — **предлагаемые места**, не утверждение об уже имеющихся файлах. Canonical types/JSDoc меняются до генерации dist declarations.

| Текущий источник/контракт | Требуемое конечное изменение |
|---|---|
| `core/documentMigrations.js`, `.test.js` | Удалить целиком; никаких встроенных или опциональных migrateV1DocumentToV2. Migration-positive tests заменить explicit rejection tests, не сохранять для совместимости. |
| `core/DocumentSchema.js` | Заменить shared current-only envelope validation, proposed `shared/DocumentSchema.js` + `shared/documentFormat.js`; old core path и migrations/forcedVersion/fallback убрать. |
| `shared/versionedDataSchema.js`, `shared/blockSchemas/*.js`, `shared/inlineSchemas/*.js` | Удалить legacyVersion/migrations и отсутствующую версию как implicit input; exact decoder C0. Для всех declared factories один conformance suite. |
| `shared/documentTypes.d.ts`, `plugin-kit/types.d.ts`, `core/publicTypes.d.ts`, `renderer/types.d.ts` | Required version/id/dataVersion; убрать DocumentMigration/DocumentMode/documentMode/validation policies, obsolete diagnostics; добавить C4/C5/C6 contracts. |
| `core/createEditorRuntime.js`, `PublicEditorApi.js`, `DocumentRuntime.js` | Удалить configs/fields preserved mode и старые event shapes; current-only preparation, explicit authority и реальный tool binding. |
| `renderer/index.js`, `EditorRenderer.js`, `inlineWidgets.js`, renderer/async и shared async loaders | Весь document/record input под C0, exact schemas; неизвестный type отдельно от известной несовместимой версии. Revision optimization не принимает непроверенную новую data за validated candidate. |
| `shared/pollData.js`, `shared/carouselData.js`, `renderer/renderers/poll/index.js`, `carousel/index.js` | Убрать восстановление missing IDs и старых votes при загрузке/render. Runtime results normalization и создание новых items остаются отдельными актуальными responsibilities, не whole-file deletion полезной функциональности. |
| `shared/blockSchemas/gallery.js`, `renderer/renderers/gallery/index.js` | Убрать LEGACY_AUTO/layout remap; явный невалидный layout отвергать, отсутствие optional layout нормализовать только если разрешено текущей schema. |
| `shared/sanitize/allowlist.js`, `walker.js`, richTextCodec + projection serializers | Убрать external widget HTML recovery, сохранить security filtering и host-owned live projection conversion. |
| `core/DocumentRuntime.js` canonical helpers | Выделить `DocumentIngestion`/`CanonicalTransforms`; убрать дубли сборки next и неоднозначный local/external ingress. |
| `core/DocumentStore.js`, `core/TransactionEngine.js`, `core/HistoryStore.js` | Prepared state/history/events, current generation/revision; удалить reset branch только для preserved mode. |
| `core/BlockReconciler.js`, `core/InlineProjectionRuntime.js`, `core/LifecycleScope.js`, `core/ExtensionRegistry.js` | Scopes до extension callbacks, immutable descriptors, revoke/task contract, uniform cleanup и locale namespace. |
| `core/ClipboardController.js`, `core/SelectionController.js`, `shared/richTextOperations.js` | Proposed `core/clipboard/FragmentCodec.js` и `FragmentImport.js` под C4. Удалить application/x-rector-editor path и fragment-v1 decode, partial plain-only Cut, ранний cross-paste shortcut и #htmlBlockRecords switch. Не возвращать старый clipboard runtime. |
| HTML consumers в plugins/heading/list/table/code/image/gallery/carousel/embed/link-preview | Перевести kind:html accepts/resolve на C3 root capability; text/file resolution остаётся отдельной функцией. |
| `plugins/{list,checklist,table,columns,quote,warning,toggle,spoiler}/index.js` | Реализовать C4 slice parts+remaining; model structure принадлежит capability, не hardcoded core data switch. |
| KeyboardRouter/NativeInput/InlineToolbar/LogicalSelection, `inline-tools/*`, `shared/editableFields.js` | C6 ownership и protected edit; убрать guessing-first-field/private-core access, старые extra args и неприкреплённые parallel sync paths. |
| `DragController.js`, `InteractionState.js`, `EditorViewModel.js`, public query adapters | Scoped drag и metadata query C7; удалить listeners без owner и full-payload reads ради IDs. |
| `core/I18n.js` | Удалить unused ScopedI18n/полноимённый compatibility bypass после проверки consumers; interpolation/plural/fallback словаря сохранить. |
| `docs/guide/*`, `docs/ru/guide/*`, README/examples, `index.html`, test fixtures, scripts | Все положительные примеры используют current formats/signatures; старые формы только в negative tests. Править canonical declaration sources, не ручной dist patch. |

Поиск consumers охватывает imports, callbacks/registration, lazy factory manifests, docs/type fixtures, scripts/browser runners и generated exports. Не считать grep единственным доказательством conformance. Сторонний extension code должен перейти на новый API; его недоступные исходники не объявляются проверенными и не оправдывают shim. История Git не очищается: отсутствие legacy относится к рабочим production paths, exports и acceptance-политике.

## 13. Порядок реализации

Каждый этап: failing/неудовлетворённый semantic proof → минимальное согласованное изменение → удаление superseded paths → адресные проверки и нужный integration gate. Документация и canonical/generated types изменяемого контракта обновляются **в том же этапе**, не откладываются до финала. Наличие известных исходных unrelated gate failures фиксируется, а не приписывается этапу; новых failures не добавлять.

### S1. Current-only формат во всех входах

**Зависимости:** нет. **Контракты/инварианты:** C0, I5/I11, P1–P3/P5. **Scope:** shared schema boundary, editor/renderer/async/public types и legacy normalizers из §12.

Начать explicit rejection отсутствующей/старой/future версии, неверного ID/dataVersion, v1-list/Table.content/old votes/layout и смешанного valid+invalid документа. Реализовать shared envelope/exact decoder; удалить migrations, preserved-document mode и configs, latent renderer normalization; перевести fixtures/examples на current schema.encode output. Все действующие local producers, включая временно ещё существующий HTML parser, сразу перевести на LocalBlockInput/encode, чтобы strict boundary не сломала их до S6. S6 заменяет сам алгоритм HTML routing, а не откладывает исправление входного контракта. Unregistered current type проверить отдельно — без путаницы с известной несовместимой версией. Существующую model/renderer сохранность поддержать на этом seam.

**Cleanup:** legacy API/options/types/export paths из C0, old JSON success tests; добавить equivalent negative proofs. **Verification:** shared schemas+factory conformance, renderer/editor rejection atomicity, declarations/package examples, адресный typecheck относительно исходного baseline.

**Завершён:** ни один serialized entry point не угадывает/мигрирует формат; ошибка не меняет live state; известная схема currentVersion=1 остаётся рабочей. Баг R2 с переходом preserved устраняется удалением ненужной state machine, не её новой реализацией.

### S2. Преобразования без потери inline

**Зависимости:** S1. **Контракты/инварианты:** C2, I1, P2/P3. **Scope:** CanonicalTransforms и record-assembly callers.

Whole paragraph+mention → heading; unknown inline, literal collision, forward/backward partial/cross conversion, split/merge; save/load/undo/redo/renderer. Перенести общие rules один раз и подключить всех callers, удалить ручные next без sidecar.

**Verification:** pure transform corpus + public command/browser conversion. **Завершён:** содержимое/связи/untouched records сохранены, unsupported conversion не удаляет источник; не требуется v1 JSON decoder для доказательства прежней пользовательской возможности.

### S3. Единый commit/recovery и mount ownership

**Зависимости:** S1/S2. **Контракты/инварианты:** C1/C5 lifecycle, I2/I3/I7, P3/P4/P5. **Scope:** Store/Engine/History/Reconciler/InlineProjection и observer adapters.

Проверить same-ID/равноданные replacement, host readOnly commands, failure второго update/history preparation, partial create и recovery failure. Внедрить prepared protocol, stage history до commit, generation/revision guards и scopes до callbacks. Выравнять event payload; remove record/reset assumptions. Доказать no-op обычных операций и deliberate replacement lifetime отдельно.

**Verification:** transaction/reconciler integration + public render/readOnly/observer/async-rejection tests. **Завершён:** каждая строка таблицы C1 пройдена; observers видят committed state, неудачный recovery блокирует editing, scopes не текут.

### S4. Registry, revocable contexts и async tasks

**Зависимости:** S3. **Контракты/инварианты:** C5 и locale C7, I7/I11, P1/P5. **Scope:** Registry/contexts, built-in async consumers и styles/resources.

Stale callback после replacement, mutable definition, missing exact decode, staged getData, task после readOnly true→false, concurrent tasks и reentrant dispose. Snapshot contracts; implement beginTask/commit/cancel и перевести built-in uploads/triggers; namespace inlinePlugin исправить в реальной ru/en сборке. Удалить legacy I18n bypass/неиспользуемый duplicate wrapper.

**Verification:** все registered block/inline factories и async conformance/lifecycle tests. **Завершён:** stale producer не вызывается, новые current tasks работают, shared immutable definition можно безопасно переиспользовать между editors.

### S5. Ownership и фактическое multi-field форматирование

**Зависимости:** S2–S4. **Контракты/инварианты:** C6, I3/I6/I8, P1/P4/P5. **Scope:** UI composition, input/keyboard/selection/toolbar и inline tools.

Auxiliary Undo matrix и createEditor → два поля таблицы/два блока → real toolbar/shortcut; mixed owners, backward selection, IME и failure второго read. Установить guard до DOM operation; объединить single/multi pathways; bind/unbind port; align через tunes. TS2554 исправляется переводом callers, docs bindSelectionPort en/ru доводится до реального API.

**Cleanup:** old extra args, same-block-only guard, private core imports/first-field guessing и unmapped sync method. **Verification:** typecheck/test:docs, native ownership, physical-history и browser formatting. **Завершён:** один Undo, правильный owner, отсутствие partial DOM/model mutation.

### S6. Полный HTML import через capabilities

**Зависимости:** S1/S2/S4. **Контракты/инварианты:** C3, I1/I3/I5, P1/P2/P5. **Scope:** input routing/HTML root capabilities.

p/ul/p, nested wrappers, text siblings, ambiguous roots, ошибка позднего блока, unsafe HTML и namespace collisions. Encode local current data, root consumption без built-in switch; перевести всех HTML consumers, text/file tasks оставить под C5.

**Cleanup:** #htmlBlockRecords и old kind:html branches, implicit local→serialized decode. **Verification:** schemas/paste conformance, plugin-source/package и browser structured paste. **Завершён:** весь допустимый input обработан в порядке, нет partial insert/fallback после начатого effect.

### S7. Канонический clipboard и безопасное удаление

**Зависимости:** S2–S6. **Контракты/инварианты:** C4, I1/I4/I5/I6, P1–P5. **Scope:** codec/import, selection slices и всех composite exporters.

Formatted/opaque Cut, same-field partial inside mark/link, cross-field/table, private mismatch+HTML, missing private MIME, unknown type, duplicate/literal refs, noneditable first/last block, readback failures и stale task/selection. Реализовать slice parts+remaining, один prepared insertion и общий serializer; неэкспортируемые исходные поля проверить явными secret sentinel assertions.

**Cleanup:** old MIME/fragment readers, plain-only Cut, cross-paste bypass и widget HTML recovery. **Verification:** codec/import + public selection/history и real browser clipboard roundtrip; synthetic I/O не считается proof доставки ОС.

**Завершён:** все target modes используют current codec, detectable failure не удаляет источник, неподдерживаемый private формат не восстанавливается lossy fallback, one-step history/selection соответствуют C4.

### S8. Pointer-session и порядок блоков

**Зависимости:** S3–S5; не зависит от S7. **Контракты/инварианты:** C7 drag, I7/I9, P3/P5.

All gaps вверх/вниз/no-op, foreign pointer, destroy/cancel/readOnly/replacement/source removal/concurrent reorder. Gap в порядке без source ID, one move commit, scoped cleanup без бессрочного click swallow.

**Verification:** controlled geometry + browser pointer gestures/history/DOM identity. **Завершён:** ожидаемый порядок, максимум одна history entry, late events инертны, все document listeners освобождены.

### S9. Дешёвые query paths

**Зависимости:** S3; выполнить после перевода affected consumers S5/S7/S8. **Контракты/инварианты:** C7 query, I10, P3.

Instrumented ID-only queries с большим untouched payload; metadata port в InteractionState/View/selection/drag/public count, snapshots остаются detached. Удалить list ради ID без второго mutable cache. Тест ограничивает traversal payload, не private call count.

**Verification:** existing 1/100/1000-block fixtures, large table, snapshot isolation, touched projections и bundle report. **Завершён:** ID-only не читает unrelated data; бюджеты не повышены, O(N) index copying не скрыто.

### S10. Функциональная матрица и сходимость

**Зависимости:** S1–S9. **Контракты/инварианты:** I1–I12/P1–P5, §§14–15.

Сценарии паритета добавляются в каждом этапе. Завершить common current-format fixtures и expected outcomes пользовательских действий; **не добавлять v1 runtime/adapter в repository, dist, tests dependencies или import graph**. Историческую v1 использовать как внешнее доказательство поведения из аудита/Git, не как принимаемый wire input. Cases старого JSON перенести в negative corpus.

Проверить canonical type generation, все factories/lazy routes, examples/docs и штатные gates §14; пройти entrypoint-to-effect trace и replacement map. **Завершён:** нет материального missing/partial/contradicts/unrequested; нет legacy aliases/декодеров/скрытого preserve известной старой версии. Количество зелёных тестов само по себе не критерий.

## 14. Матрица доказательств

| Цель | Обязательные доказательства |
|---|---|
| I5/I11, P1/P2/P5 — C0 | Editor/renderer/async/clipboard: missing/old/future versions, old shapes с текущей версией, invalid late block, strict same-state rejection, unregistered current type и currentVersion=1. Removed configs отвергаются; их нет в generated/public exports. |
| I1, P2/P3 — C2 | Whole/partial/backward/cross conversion, split/merge, known/unregistered inline, collisions/literals, save/load, one-step undo/redo и renderer. |
| I2/I3, P3/P4 — C1 | Initial/create, deliberate equal-data replacement, ordinary no-op, all host/interaction readOnly outcomes, inverse event order, observer failures, prepare/apply/history/recover faults, deferred selection revision. |
| I4/I5, P2/P5 — C3/C4 | Mixed HTML, composite export+remaining, private validation без fallback, no unselected-content leak, readback/stale failures, real independent-editor clipboard gestures. |
| I6/I8, P1/P4 — C6 | Native input/textarea/select auxiliary и document-owned, popup/chrome/outside, Ctrl/Meta Z/ShiftZ/Y+beforeinput, same-block multi-field/backward selection, реальный binding и alignment только tunes. |
| I7/I11, P1/P5 — C5 | Mutable/accessor descriptors, defaults roundtrip, staged reads, все mount failure stages, revoke/task readOnly epoch/settlement/reentry, all factories и heap/lifecycle. |
| I9, P3 — C7 | Every drop gap, foreign pointer, termination matrix, один Undo и сохранение DOM identity. |
| I10, P3 — C7 | Queries без payload traversal, detached external values, touched projection count и честный benchmark под текущими budgets. |
| I11, P1 — C7 | Real ru/en labels/noResults, повторное использование definitions, отсутствие legacy namespace path. |
| I12, P1–P5 | Все block/tools/media/poll/settings/source/lazy/renderer/security/TT capabilities; current examples/package consumers, negative legacy corpus и архитектурная convergence. |

Сравнивать пользовательское содержимое/marks/inline graph, порядок, selection/focus и смысловые history steps. Разные JSON shapes/API имена не обязаны совпадать с v1. Между независимыми запусками можно нормализовать случайные первичные ID/save timestamps; нельзя скрывать пропавший payload, unintended aliasing, перестановку текста или изменение identity внутри сценария. Явная политика block-fragment placement в составное поле C4 проверяется как новый контракт, не маскируется под байтовую идентичность v1.

Проверенные project commands:

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

Включить conformance в существующие runners. Удаление migration-positive test допустимо только вместе с negative replacement и сохранением security/current behavior corpus. Forbidden-path proof проверяет exports/import graph/factory contracts и текущие call paths, не запрещает само слово legacy в историческом аудите, отрицательном fixture или защитном комментарии. Generated dist declarations получаются через существующие scripts/generate-declarations/build, не правятся отдельно.

При недоступном локальном browser proof использовать CI того же проверенного SHA и указать происхождение результата. Непроверенная строка acceptance не становится выполненной. Исходные tests на preserved mode не надо «чинить до зелёного»: после S1 заменить их rejection-without-mutation proof.

## 15. Сверка после реализации

Проследить `createEditor/render -> current input boundary -> ownership/selection -> command/transform -> transaction/projection -> observers/save/renderer`, а также revoke, failure recovery, readonly epoch и unsupported private clipboard. Проверить то же через package imports/async factories, не только source-level mocks.

Каждое расхождение классифицировать `missing`, `partial`, `contradicts`, `unrequested` и исправить владеющий код либо явно пересмотреть нормативный контракт. Ненужную совместимость удалить, а не объявлять безопасной «на будущее». Отдельно подтвердить карту удаления §12 и отсутствие положительных требований читать legacy JSON в действующей документации.

Завершение — все I/P имеют proof, отсутствуют материальные расхождения, старые working paths удалены. Это не сертификация отсутствия всех багов и не обещание атомарной транзакции с системным clipboard.
