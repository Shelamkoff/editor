# API редактора

`createEditor()` возвращает один дескриптор `IEditor`. Публичный API предоставляет канонические данные и команды; изменяемый DOM блоков и внутренние управляющие объекты наружу не выдаются.

## Дескриптор редактора

```ts
interface IEditor {
  readonly blocks: EditorBlocksApi
  readonly isReady: boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly readOnly: boolean

  save(): EditorDocument
  render(document: EditorDocument): void
  clear(): void
  undo(): boolean
  redo(): boolean
  focus(): boolean
  setReadOnly(readOnly: boolean): void
  insertInlinePlugin(type: string, data?: Record<string, unknown>): boolean
  on<K extends keyof EditorEventMap>(type: K, listener: (payload: EditorEventMap[K]) => void | Promise<void>): () => void
  destroy(): void
}
```

`save()` возвращает отделённый канонический документ. `render()` заменяет документ через ту же current-format границу схем, что используется при создании. `clear()` создаёт один пустой блок по умолчанию. `undo()` и `redo()` являются interaction-командами и недоступны в режиме чтения.

## API блоков

`editor.blocks` использует идентичность по ID; команды принимают ID блока, а не индекс как изменяемый дескриптор.

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
| `update(id, producer)` | Выполнить изменение `BlockUpdate` через модель. |
| `remove(id)` | Удалить блок. |
| `move(id, to)` | Переместить ID в конечный индекс. |
| `convert(id, target)` | Преобразовать блок через зарегистрированные возможности преобразования. |
| `focus(id, target?)` | Фокус логического редактируемого поля. |
| `Symbol.iterator` | Итерация неизменяемых снимков. |

## Неизменяемые снимки

`EditorBlockSnapshot` содержит `id`, `type`, `dataVersion`, `data`, необязательные `tunes`, `inline`, `revision` и `status` активации.

Снимок никогда не содержит смонтированный `element`. DOM — проекция канонического состояния, а не API хранения. Для изменений приложение использует ID и команды `editor.blocks`.

## События

Подписка выполняется через `editor.on(type, listener)`; метод возвращает функцию отписки.

Публичные события:

- `editor:ready`
- `editor:destroyed`
- `transaction:committed`
- `document:changed`
- `history:changed`
- `readOnly:changed`
- `currentBlock:changed`
- `selection:changed`

`currentBlock:changed` передаёт текущий ID после фактической смены блока. `selection:changed` передаёт выбранные ID в порядке документа только при изменении набора/порядка выделения.

`transaction:committed` получает один неизменяемый payload `TransactionCommitted`: `{ sequence, origin, action, name, changes, history }`. `sequence` — зафиксированная ревизия документа; она возрастает при обычном commit, undo и redo. `document:changed` передаёт только `{ origin, action, changes }` из того же зафиксированного события, а `history:changed` — уже зафиксированное состояние `{ canUndo, canRedo }`. Observers вызываются только после общей commit point модели, курсора истории и проекции.

События только наблюдают за завершёнными действиями. Код приложения и расширений не создаёт события редактора самостоятельно.

Режим чтения ограничивает полномочия взаимодействия, а не владение host-приложения. При `readOnly === true` блокируются пользовательские, native, clipboard и plugin mutations, а также undo/redo, но host по-прежнему может вызывать `render()`, `clear()` и `editor.blocks.insert/update/remove/move/convert()`. Эти host mutations проходят каноническую транзакцию и снова доступны для undo после возврата в режим редактирования; во время read-only `canUndo` и `canRedo` равны `false`.

## Жизненный цикл

`isReady` становится `true` после успешной сборки и доставки микрозадачи готовности. Это единственное состояние дескриптора, которое остаётся читаемым после `destroy()`; после уничтожения оно возвращает `false`.

`destroy()` идемпотентен. Он отменяет работу редактора и блоков, удаляет принадлежащие редактору DOM, стили и обработчики и освобождает `holder`.

Все сохранённые ссылки на API редактора и блоков после уничтожения отзываются. Чтение, изменение и новая подписка отклоняются вместо доступа к устаревшему состоянию. Полученную до уничтожения функцию отписки можно безопасно вызвать.

## Владение DOM

Приложение владеет `holder`; Rector владеет узлами внутри него, пока редактор работает. Не сохраняйте ссылки на DOM блока между заменой документа, преобразованием, отменой/повтором и сменой режима только для чтения или заменой документа.

Расширенные контракты типов доступны через `@shelamkoff/rector/types`.
