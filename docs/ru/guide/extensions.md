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
| `beginTask()` | Создать отзывные полномочия для сохранения одного асинхронного результата. |
| `commitDomMutation(operation)` | Перенос неизбежной plugin-owned DOM-мутации в каноническую историю. |
| `requestSplit()` | Запрос структурного split у ядра. |
| `requestExit()` | Запрос выхода из пустого структурированного блока. |
| `isReadOnly()` | Можно ли сейчас изменять документ. |

Унаследованный `createId(prefix)` создаёт стабильные вложенные идентификаторы.

## Схема

`BlockDataSchema` предоставляет `currentVersion`, `createDefault()`, `decode()` точной версии, `encode()` и необязательный `mapRichText()`.

Внешние данные декодируются один раз на границе. Каждое model-first изменение кодируется до commit. `mapRichText()` обозначает все HTML-поля стабильными логическими ключами; через эту же границу работают inline-виджеты, структурное выделение и частичное преобразование.

## Capabilities

`BlockCapabilities` может содержать `empty`, `formatting`, `merge`, `conversion`, `htmlImport`, `clipboard`, `selectionSlice`, `inlineControls`, `settings`, `paste` и `shortcuts`.

- `empty.isEmpty(data)` определяет поведение пустого блока.
- `formatting.inlineTools` равно `true` или allowlist.
- `merge.merge(target, source)` — чистое объединение данных.
- `conversion` экспортирует/импортирует нейтральный `ConversionPayload`. Поле `selectionMode` определяет межблочное преобразование: `'single'` (по умолчанию) заменяет выделенный интервал одним блоком цели с начальными данными; `'per-block'` отдельно импортирует каждый выбранный фрагмент исходного блока. Импорт подписи не означает текстовую группировку. Оба режима сохраняют невыделенные данные на границах и создают один шаг отмены. Объявляйте `'per-block'`, только если каждый фрагмент имеет смысл как самостоятельный целевой блок; неподдерживаемый импорт отклоняется до изменения документа.
  Для единственной цели можно объявить `joinSelection(payloads, { ownerDocument })`, чтобы объединить выделенное авторское содержимое перед импортом. Code использует этот метод для одного блока с декодированным текстом и переносами строк. Реестр фиксирует метод; ядро проверяет результат и отклоняет потерю внутристрочных виджетов до изменения документа. Текстовые блоки уже совпадающего типа сохраняют свои поля, параметры и идентичность вместо повторного импорта из нейтрального текста.
- `selectionSlice.slice(...)` описывает часть структурированных данных без изменения DOM.
- `inlineControls` переиспользует model-first settings actions во внутристрочной панели.
- `settings` — actions capability или model-first panel.
- `htmlImport.matchesRoot/importRoot` синхронно импортирует один безопасный структурный HTML-элемент в локальные текущие данные конкретного типа блока. Возможность должна потреблять элемент целиком без побочных эффектов.
- `ClipboardCapability` через `clipboard.slice(data, context)` возвращает экспортируемые `parts`, канонический остаток `remaining` после вырезания и необязательный `focus`. `context.field(key)` предоставляет выбранные интервалы форматированного текста: `before/selected/after/whole`. Экспорт и остаток вычисляются одной чистой операцией; ядро не угадывает структуру данных.
- `paste` маршрутизирует только текст и файлы в результат блока или форматированного текста; структурный HTML ему не передаётся.
- `shortcuts` возвращает действия единому keyboard router ядра.

## Настройки, вставка и клавиши

`SettingsActionCapability` содержит `kind`, `actions(data, context)` и `apply(data, actionId, context)`. Необязательный локализованный `label` задаёт имя группы во внутристрочной панели; действия с булевым `active` показывают выбранное состояние как пункты радиоменю.

`SettingsPanelCapability` содержит `kind: 'panel'` и `render(context)`; контекст предоставляет `getData()` и `updateData()`. Контекст принадлежит конкретной панели и экземпляру блока. Закрытие панели, замена владельца, переход в read-only, уничтожение или ошибка фабрики навсегда отзывают его: сохранённые функции изменения не вызываются, а `getData()` возвращает только последний собственный снимок.

`HtmlImportCapability` содержит `matchesRoot(element)` и `importRoot(element, context)`. Контекст предоставляет `ownerDocument`, `createId()` и `serializeRichText(element)` для обычного кодирования форматированного текста. Ядро безопасно разбирает весь HTML и строит полный план; ошибка любого принятого элемента отклоняет импорт до изменения документа.

`PasteCapability` содержит `accepts(input)` и `resolve(input, context)` только для текста и файлов. Обработчик получает `AbortSignal`, `ownerDocument` и `createId()`.

`ShortcutCapability` содержит `handle(input, data, context)`. Он возвращает `native`, `consume`, `exit`, `focus` или `update`; структурную транзакцию выполняет ядро.

Контекст предоставляет `createId()`, `splitField(fieldKey, range)` и `fieldLength(fieldKey)`. Длины полей считаются в логических единицах `UTF-16`; перенос строки и атомарный виджет занимают одну единицу. Исходная длина целевого поля позволяет оставить каретку на месте склейки вместо конца объединённого текста. Действие `update` возвращает данные блока и необязательную цель фокуса; ядро сохраняет эту цель для отмены и повтора. Действие `exit` без данных преобразует текущий блок в тип по умолчанию. С `data` оно сначала обновляет сохраняемый блок и вставляет блок по умолчанию сразу после него одним шагом истории: списки используют это для выхода из последнего пустого пункта.

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

DOM не является хранилищем. Явные синхронные элементы управления вызывают `updateData()`; обычный ввод в зарегистрированных полях синхронизирует ядро. Для сохранения асинхронного результата захватите `const task = context.beginTask()`, передайте `task.signal` внешней операции и завершите её через `task.commit(current => next)`. Обработчик получает последние зафиксированные данные только живого экземпляра. Замена, уничтожение, смена поколения и переход `readOnly: false → true` отзывают задачу; возврат к редактированию её не возобновляет. `cancel()` идемпотентен. Запросы, изменяющие только отображение, могут использовать обычный `signal` жизненного цикла.

## Связь с renderer

Для нового сохраняемого типа блока нужен read-only renderer с теми же type/schema semantics. DOM renderer не зависит от DOM `BlockInstance`.
