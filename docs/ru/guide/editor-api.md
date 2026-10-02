# API редактора

`createEditor()` возвращает один дескриптор `IEditor`. Публичный API предоставляет канонические данные и команды; изменяемый DOM блоков и внутренние managers наружу не выдаются.

## Дескриптор редактора

```ts
interface IEditor {
  readonly blocks: EditorBlocksApi
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly readOnly: boolean
  readonly documentMode: 'editable' | 'preserved'

  save(): EditorDocument
  render(document: EditorDocument): void
  clear(): void
  undo(): boolean
  redo(): boolean
  focus(): boolean
  setReadOnly(readOnly: boolean): void
  insertInlinePlugin(type: string, data?: Record<string, unknown>): boolean
  on(type: EditorEventName, listener: (payload?: unknown) => void): () => void
  destroy(): void
}
```

`save()` возвращает отделённый канонический документ. `render()` заменяет документ через те же схемы и миграции, что используются при создании. `clear()` создаёт один пустой блок по умолчанию. `undo()` и `redo()` возвращают `false`, если подходящего шага истории нет или редактирование недоступно.

## API блоков

`editor.blocks` использует идентичность по ID; команды принимают ID блока, а не индекс как изменяемый handle.

| Член | Назначение |
| --- | --- |
| `count` | Число канонических блоков. |
| `currentId` | ID текущего блока взаимодействия или `null`. |
| `get(id)` | Неизменяемый `EditorBlockSnapshot` по ID. |
| `at(index)` | Неизменяемый снимок по текущему порядку. |
| `list()` | Отделённые неизменяемые снимки по порядку документа. |
| `indexOf(id)` | Текущий индекс ID или `-1`. |
| `setCurrent(id)` | Выбор блока взаимодействия. |
| `selectedIds()` | ID временно выбранных блоков. |
| `select(ids)` | Установить временное выделение блоков. |
| `clearSelection()` | Очистить временное выделение. |
| `insert(input, index?)` | Вставить `InsertBlockInput`; возвращает новый ID. |
| `update(id, producer)` | Выполнить model-first `BlockUpdate`. |
| `remove(id)` | Удалить блок. |
| `move(id, to)` | Переместить ID в конечный индекс. |
| `convert(id, target)` | Преобразовать блок через зарегистрированные conversion capabilities. |
| `focus(id, target?)` | Фокус логического редактируемого поля. |
| `Symbol.iterator` | Итерация неизменяемых снимков. |

## Неизменяемые снимки

`EditorBlockSnapshot` содержит `id`, `type`, `dataVersion`, `data`, необязательные `tunes`, `inline`, `revision` и `status` активации.

Снимок никогда не содержит смонтированный `element`. DOM — проекция канонического состояния, а не API хранения. Для изменений host использует ID и команды `editor.blocks`.

## События

Подписка выполняется через `editor.on(type, listener)`; метод возвращает функцию отписки.

Публичные события:

- `editor:ready`
- `editor:destroyed`
- `transaction:committed`
- `document:changed`
- `history:changed`
- `readOnly:changed`

События только наблюдают за завершёнными действиями. Код приложения и расширений не создаёт события редактора самостоятельно.

## Жизненный цикл

`destroy()` идемпотентен. Он отменяет работу редактора и блоков, удаляет принадлежащие редактору DOM/styles/listeners и освобождает `holder`.

Все сохранённые ссылки на editor/block API после уничтожения отзываются. Чтение, изменение и новая подписка отклоняются вместо доступа к устаревшему состоянию. Полученную до уничтожения функцию отписки можно безопасно вызвать.

## Владение DOM

Host владеет `holder`; Rector владеет узлами внутри него, пока редактор работает. Не сохраняйте ссылки на DOM блока между render, conversion, undo/redo, сменой read-only режима или заменой документа.

Расширенные TypeScript-контракты доступны через `@shelamkoff/rector/types`.
