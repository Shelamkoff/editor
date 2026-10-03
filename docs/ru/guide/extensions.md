# Создание расширений

Rector v2 использует неизменяемые definitions. Definition содержит переиспользуемую конфигурацию, схемы и чистые capabilities; изменяемое состояние редактора создаётся в `setup()`, а состояние конкретного блока — в `runtime.create()`.

## Definition блока

```ts
interface BlockPluginDefinition<Data> {
  readonly type: string
  readonly label: { key: string, fallback: string }
  readonly icon: string
  readonly styles?: readonly string[]
  readonly toolbox?: readonly ToolboxItemDefinition<Data>[]
  readonly schema: BlockDataSchema<Data>
  readonly capabilities?: BlockCapabilities<Data>
  setup(context: BlockPluginRuntimeContext): BlockPluginRuntime<Data>
}
```

| Член | Назначение |
| --- | --- |
| `type` | Стабильный машинный идентификатор в документе. |
| `label` | Ключ локализации и fallback для UI. |
| `icon` | Доверенная разметка иконки, принадлежащая расширению. |
| `styles` | URL стилей definition. |
| `toolbox` | Необязательные варианты вставки. |
| `schema` | Версионируемый контракт канонических данных. |
| `capabilities` | Чистые необязательные контракты поведения. |
| `setup` | Создаёт один runtime на экземпляр редактора. |

## Runtime и экземпляр блока

`BlockPluginRuntime` содержит `create(initial, context)` и `destroy()`. Каждый `create()` возвращает один `BlockInstance`.

`BlockInstance` предоставляет `element`, `read()`, необязательный `update(next, previous)`, необязательный `editableFields()`, `setReadOnly(readOnly)`, необязательный `focus(target)` и `destroy()`.

`BlockInstanceContext` предоставляет:

| Член | Использование |
| --- | --- |
| `ownerDocument` | Создание DOM и browser-объектов в realm редактора. |
| `signal` | AbortSignal конкретного экземпляра блока. |
| `getData()` | Чтение текущих канонических данных. |
| `updateData(producer)` | Синхронная model-first транзакция данных блока. |
| `beginTask()` | Создать отзывную authority для одного асинхронного persisted-результата. |
| `commitDomMutation(operation)` | Перенос неизбежной plugin-owned DOM-мутации в каноническую историю. |
| `requestSplit()` | Запрос структурного split у ядра. |
| `requestExit()` | Запрос выхода из пустого структурированного блока. |
| `isReadOnly()` | Можно ли сейчас изменять документ. |

Унаследованный `createId(prefix)` создаёт стабильные вложенные идентификаторы.

## Схема

`BlockDataSchema` владеет `currentVersion`, `createDefault()`, exact-version `decode()`, `encode()` и необязательным `mapRichText()`.

Внешние данные декодируются один раз на границе. Каждое model-first изменение кодируется до commit. `mapRichText()` обозначает все HTML-поля стабильными логическими ключами; через эту же границу работают inline-виджеты, структурное выделение и частичное преобразование.

## Capabilities

`BlockCapabilities` может содержать `empty`, `formatting`, `merge`, `conversion`, `htmlImport`, `selectionSlice`, `inlineControls`, `settings`, `paste` и `shortcuts`.

- `empty.isEmpty(data)` определяет поведение пустого блока.
- `formatting.inlineTools` равно `true` или allowlist.
- `merge.merge(target, source)` — чистое объединение данных.
- `conversion` экспортирует/импортирует нейтральный `ConversionPayload`.
- `selectionSlice.slice(...)` описывает часть структурированных данных без изменения DOM.
- `inlineControls` переиспользует model-first settings actions во внутристрочной панели.
- `settings` — actions capability или model-first panel.
- `htmlImport.matchesRoot/importRoot` синхронно импортирует один безопасный структурный HTML root в local current data конкретного block type; capability обязана потреблять весь root и не выполнять side effects.
- `paste` маршрутизирует только text/file inputs в block или rich-text result; structural HTML ему не передаётся.
- `shortcuts` возвращает действия единому keyboard router ядра.

## Настройки, вставка и клавиши

`SettingsActionCapability` содержит `kind`, `actions(data, context)` и `apply(data, actionId, context)`.

`SettingsPanelCapability` содержит `kind: 'panel'` и `render(context)`; context предоставляет `getData()` и `updateData()`.

`HtmlImportCapability` содержит `matchesRoot(element)` и `importRoot(element, context)`. Context предоставляет `ownerDocument`, `createId()` и `serializeRichText(element)` для обычного rich-text codec. Core сначала безопасно разбирает весь HTML и строит полный plan; ошибка любого принятого root отклоняет весь import до mutation.

`PasteCapability` содержит `accepts(input)` и `resolve(input, context)` только для text/file input. Resolver получает `AbortSignal`, `ownerDocument` и `createId()`.

`ShortcutCapability` содержит `handle(input, data, context)`. Он возвращает `native`, `consume`, `exit`, `focus` или `update`; структурную транзакцию выполняет ядро.

`SelectionSliceCapability` содержит `slice(data, start, end, context)` и возвращает `before`, нейтральный `selected` payload и `after`.

## Минимальное definition

```js
export function createCalloutPlugin() {
  const schema = Object.freeze({
    currentVersion: 1,
    createDefault: () => ({ text: '' }),
    decode({ dataVersion, data }) {
      if (dataVersion !== 1) throw new RangeError('Unsupported callout dataVersion')
      if (!data || typeof data.text !== 'string') throw new TypeError('Invalid callout')
      return { dataVersion: 1, data: { text: data.text } }
    },
    encode(data) {
      if (typeof data.text !== 'string') throw new TypeError('Invalid callout')
      return { dataVersion: 1, data: { text: data.text } }
    },
    mapRichText(data, transform) {
      return { ...data, text: transform(data.text, 'text') }
    },
  })

  return Object.freeze({
    type: 'callout',
    label: Object.freeze({ key: 'title', fallback: 'Callout' }),
    icon: '<svg viewBox="0 0 24 24">...</svg>',
    styles: Object.freeze([new URL('./callout.css', import.meta.url).href]),
    schema,
    capabilities: Object.freeze({
      formatting: Object.freeze({ inlineTools: true }),
      empty: Object.freeze({ isEmpty: data => data.text.trim() === '' }),
    }),
    setup() {
      return {
        create(initial, context) {
          const element = context.ownerDocument.createElement('aside')
          element.contentEditable = context.isReadOnly() ? 'false' : 'true'
          element.textContent = initial.text
          return {
            element,
            read: () => ({ text: element.innerHTML }),
            editableFields: () => [{ key: 'text', element, mode: 'rich-text' }],
            setReadOnly(value) { element.contentEditable = value ? 'false' : 'true' },
            focus() { element.focus() },
            destroy() {},
          }
        },
        destroy() {},
      }
    },
  })
}
```

## Правила владения

Definitions неизменяемы и переиспользуемы. Таймеры, кэши и подписки конкретного редактора принадлежат `BlockPluginRuntime`; listeners, observers, requests и object URLs конкретного блока принадлежат `BlockInstance` и его `signal`.

Нельзя использовать DOM как хранилище. Явные синхронные controls вызывают `updateData()`; обычный ввод в editable fields синхронизирует ядро. Для асинхронной операции, которая позже меняет persisted data, захватите `const task = context.beginTask()`, передайте `task.signal` во внешнюю работу и завершите её через `task.commit(current => next)`. Producer вызывается только для всё ещё живого экземпляра, с последними committed данными. Replacement/destroy, смена generation и переход `readOnly: false → true` отзывают task; возврат обратно в edit не оживляет старую task. `cancel()` идемпотентен. Presentation-only запросы, которые не меняют persisted data, могут использовать обычный lifecycle `signal`.

## Связь с renderer

Для нового сохраняемого типа блока нужен read-only renderer с теми же type/schema semantics. DOM renderer не зависит от DOM `BlockInstance`.
