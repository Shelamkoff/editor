# Внутристрочные инструменты и плагины

В Rector существуют две разные inline-модели: инструменты форматирования изменяют выбранный rich-text диапазон, а definitions внутристрочных плагинов сохраняют структурированные виджеты в канонической карте `inline` блока.

## Контракт inline tool

```ts
interface InlineTool {
  readonly type: string
  readonly title?: string
  readonly icon: string
  readonly shortcut?: string
  readonly tag?: string
  bindSelectionPort?(port: CrossEditableSelectionPort | null): void
  isActive(selection: InlineSelection): boolean
  toggle(selection: InlineSelection): void
  renderActions?(context: InlineToolActionContext): HTMLElement | null
  getIcon?(active: boolean): string
  getTitle?(active: boolean): string
  onMount?(button: HTMLElement, mutations?: InlineMutationContext): void
  isDropdownOpen?(): boolean
  destroy?(): void
}
```

`InlineToolActionContext` содержит `range`, `mutate(operation)`, `getTextAlign()`, `setTextAlign(value)`, `restoreSelection()`, `close()`, `showTooltip(anchor, label)` и `hideTooltip()`. Новое изменение выделения отзывает сохранённый контекст панели; ранее полученный контекст не может изменить новое выделение.

При подключении инструмента ядро вызывает `bindSelectionPort(port)`, а при уничтожении — `bindSelectionPort(null)`. Контекст выделения передаёт текущий диапазон между полями. Каждому редактору нужны собственные изменяемые экземпляры инструментов.

`InlineMutationContext` предоставляет `mutate(range, operation)` для смонтированного control.

Инструмент форматирования не хранит отдельные данные. Выделение может охватывать несколько зарегистрированных полей форматированного текста одного или нескольких блоков; инструмент доступен только при разрешении каждого затронутого блока. Изменение DOM проходит одной защищённой транзакцией и нормализуется во все затронутые блоки. Поля `plain-text` и вспомогательные поля ввода не форматируются частично. `setTextAlign()` изменяет только `tunes.textAlign` выбранных блоков, не записывая CSS или `data.align` в данные плагина.

Встроенный набор предоставляет `bold`, `italic`, `strikethrough`, `link`, `code`, `marker`, `bgcolor`, `fontSize`, `script`, `align`, `caseTransform` и `clearFormatting`.

## Definition inline plugin

```ts
interface InlinePluginDefinition<Data> {
  readonly type: string
  readonly label: { key: string, fallback: string }
  readonly icon: string
  readonly styles?: readonly string[]
  readonly trigger?: string
  readonly schema: InlineWidgetSchema<Data>
  readonly paste?: InlineWidgetPasteCapability<Data>
  readonly editing?: InlineWidgetEditCapability<Data>
  readonly insertion?: { createInitial(): InlineFreshInsertion<Data> }
  setup(context: InlinePluginRuntimeContext): InlinePluginRuntime<Data>
}
```

ID виджета принадлежит модели документа. Rich text хранит ссылку `{{id}}`, а `inline[id]` блока — type, версию данных и данные. DOM-проекция каждый раз строится из этой канонической пары.

## Runtime и экземпляр виджета

`InlinePluginRuntimeContext` предоставляет `ownerDocument`, `signal`, `t(key, fallback, params?)`, `showPopup(anchor, content, cleanup)` и `hidePopup()`. Параметры перевода подставляются вместо шаблонов вроде `{level}` через общий словарь редактора.

`InlinePluginRuntime` предоставляет `create(id, initial, context)`, необязательные `onTriggerQuery(session)`, `onTriggerKeydown(event, session)`, `onTriggerCancel()` и `destroy()`.

Каждый `create()` возвращает `InlineWidgetInstance` с `element`, необязательным `update(next, previous)`, `setReadOnly(readOnly)`, необязательным `focus()` и `destroy()`.

`InlineWidgetContext` предоставляет `id`, `blockId`, `fieldKey`, `signal`, `getData()`, `updateData(producer)`, `beginTask()` и `isReadOnly()`.

## Trigger-сессии

Definition может объявить `trigger` длиной в один Unicode code point. Ядро владеет диапазоном trigger и передаёт runtime временный `InlineTriggerSession`. Поиск и pagination — временный UI; только `session.commit(data)` создаёт каноническую вставку.

Сессия отзывается при смене фокуса, замене документа, read-only переходе, уничтожении или появлении новой сессии. Сохранённые callbacks старого UI должны становиться инертными.

## Paste и программная вставка

`paste.patterns` задаёт текстовые patterns; `fromMatch(match)` возвращает канонические данные виджета либо `null`.

`insertion.createInitial()` используется `editor.insertInlinePlugin(type, data?)` и возвращает payload виджета либо обычный текст.

`editing.handle(input, data)` обрабатывает model-first редактирование уже сохранённого виджета и может вернуть `update`, `remove` или `replace-text`.

## Пример регистрации

```js
import { createColorSwatchPlugin } from '@shelamkoff/rector/inline-plugins/color'
import { createMentionPlugin } from '@shelamkoff/rector/inline-plugins/mention'

const editor = createEditor({
  holder,
  plugins,
  inlinePlugins: [
    createColorSwatchPlugin(),
    createMentionPlugin({ searchFunction: searchPeople }),
  ],
})
```

Для read-only вывода регистрируйте отдельные `InlineWidgetRenderer` через `EditorRenderer.inlineRenderers`. Runtime редактора не используется как renderer persistence API.

## Владение и безопасность

Создавайте DOM в `ownerDocument`, привязывайте listeners блока/виджета к выданному `signal`, а cleanup popup — к popup host. Нельзя восстанавливать данные виджета из произвольных DOM-атрибутов; канонический источник — `getData()`.

Результаты поиска и пользовательские labels выводятся как текст. В trusted markup sinks попадают только package-owned icons.
