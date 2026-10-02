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

`InlineToolActionContext` содержит `range`, `mutate(operation)`, `restoreSelection()`, `close()`, `showTooltip(anchor, label)` и `hideTooltip()`. После завершения сессии сохранённый context становится инертным.

`InlineMutationContext` предоставляет `mutate(range, operation)` для смонтированного control.

Инструмент форматирования не имеет отдельного persisted payload. Его DOM-изменение проходит через транзакционную границу inline toolbar и нормализуется обратно в rich-text поле блока.

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

`InlinePluginRuntimeContext` предоставляет `ownerDocument`, `signal`, `t(key, fallback)`, `showPopup(anchor, content, cleanup)` и `hidePopup()`.

`InlinePluginRuntime` предоставляет `create(id, initial, context)`, необязательные `onTriggerQuery(session)`, `onTriggerKeydown(event, session)`, `onTriggerCancel()` и `destroy()`.

Каждый `create()` возвращает `InlineWidgetInstance` с `element`, необязательным `update(next, previous)`, `setReadOnly(readOnly)`, необязательным `focus()` и `destroy()`.

`InlineWidgetContext` предоставляет `id`, `blockId`, `fieldKey`, `signal`, `getData()`, `updateData(producer)` и `isReadOnly()`.

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
