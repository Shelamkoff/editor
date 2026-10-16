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

`InlineSelection.textAlign` описывает текущее каноническое выравнивание выбранных блоков с разрешённым форматированием: `left`, `center`, `right`, `justify` или `mixed`. Инструмент может читать его для обновления иконки, названия и активного состояния без открытия панели действий.

`InlineToolActionContext` содержит `range`, `mutate(operation)`, `getTextAlign()`, `setTextAlign(value)`, `restoreSelection()`, `close()`, `showTooltip(anchor, label, shortcut?)`, `hideTooltip()` и необязательный локализованный `backLabel`. Закрытие панели восстанавливает сохранённое выделение документа. Новое выделение документа, закрытие панели, замена документа или любого выбранного экземпляра блока, read-only, уничтожение либо ошибка фабрики отзывают контекст. Сохранённые callbacks не могут вызвать функцию изменения, прочитать выравнивание нового владельца, восстановить выделение, закрыть следующую панель или показать её подсказки.

При открытии панели тулбар фокусирует первое доступное поле или кнопку, если панель ещё не владеет фокусом. `Escape` из любого элемента закрывает панель и возвращает сохранённое выделение документа; элемент может забрать `Escape` через `preventDefault()` или `stopPropagation()`. Отозванная панель не может восстановить фокус или закрыть следующую панель.

При подключении инструмента ядро вызывает `bindSelectionPort(port)`, а при уничтожении — `bindSelectionPort(null)`. Контекст выделения передаёт текущий диапазон между полями. Каждому редактору нужны собственные изменяемые экземпляры инструментов.

`InlineMutationContext` предоставляет `mutate(range, operation)` для смонтированного control. Необязательный `restoreSelection()` возвращает фокус и текущий диапазон ядра после отмены вспомогательной панели, не изменяя данные и историю; возвращает `false`, если редактирование или корректное выделение недоступно.

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

Ядро устанавливает и поддерживает `data-inline-plugin` и `data-id` на стабильном корневом элементе экземпляра. Расширению не нужно записывать эти атрибуты. Они обеспечивают атомарные координаты: виджет занимает одну позицию родительского поля независимо от длины подписи. Сериализацией управляет закрытая привязка экземпляра; копирование DOM-атрибутов не создаёт виджет или payload. Содержимое и редактируемое/read-only представление остаются ответственностью виджета.

После полной нормализации схемы каноническая сборка подсчитывает принадлежащие блоку ссылки в текстовых узлах всех rich-text полей, включая скрытые. Дублирующиеся ссылки отклоняют изменение. Токены в атрибутах и литеральные токены без собственного payload не учитываются. Данные незагруженных расширений сохраняются, пока на них есть ссылка; при смысловых изменениях удаляются только неиспользуемые записи.

`InlinePluginRuntimeContext` предоставляет `ownerDocument`, `signal`, `t(key, fallback, params?)` и `showPopup(anchor, content, cleanup?)`. Параметры перевода подставляются вместо шаблонов вроде `{level}` через общий словарь редактора. `showPopup()` возвращает замороженный `{ close(): void }` для одной презентации. Сохраняйте исходный handle в обработчиках: устаревший handle не закрывает новый popup или popup другого расширения. Ядро закрывает popup при внешнем клике, удалении якоря, переходе read-only и уничтожении.

Якорь и содержимое должны быть HTML-элементами документа владельца; переданная очистка должна быть функцией. Некорректные аргументы отклоняются до замены popup. Недоступный якорь или режим взаимодействия возвращает уже закрытый handle с однократной попыткой очистки. Очистка вызывается после отзыва презентации под наблюдательными полномочиями: изменять документ, управление и задачи нельзя. Ошибки и асинхронное завершение изолируются. Новый popup, открытый из очистки, сохраняет приоритет перед устаревшим внешним запросом.

`InlinePluginRuntime` предоставляет `create(id, initial, context)`, необязательные `onTriggerQuery(session)`, `onTriggerKeydown(event, session)`, `onTriggerCancel()` и `destroy()`.

Каждый `create()` возвращает `InlineWidgetInstance` с `element`, необязательным `update(next, previous)`, `setReadOnly(readOnly)`, необязательным `focus()` и `destroy()`. Если definition поддерживает нативное удаление внутри виджета через `editing.reconcileNative`, синхронный `update(next, previous)` **обязателен**. Дополнительно экземпляр может реализовать синхронный `afterNativeEdit(notice)` для временного UI/поиска; это наблюдательное уведомление, а не команда.

`InlineWidgetContext` предоставляет ровно `id`, `blockId`, `fieldKey`, `signal`, `getData()`, `updateData(producer)`, `commitDomMutation(operation)`, `beginTask()` и `isReadOnly()`. Выделением inline ID управляет ядро.

`commitDomMutation()` синхронно меняет принадлежащее виджету зарегистрированное rich-text поле/вхождение, после чего ядро сериализует полный блок в существующую транзакцию. Каноническое изменение создаёт один шаг отмены; равный результат не создаёт истории. Ошибка, возвращённый `Promise`/thenable или исключение свойства `then` восстанавливает сохранённую проекцию и выделение; неудачное восстановление сохраняет поведение состояния отказа. Отозванный/read-only/неисправный контекст не вызывает обработчик, а подготовленный контекст или защищённый повторный вход отклоняются до вызова. Данные меняйте через `updateData()`, асинхронную работу выполняйте через `beginTask()`. Не планируйте отложенные DOM-изменения из защищённого обработчика.

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
