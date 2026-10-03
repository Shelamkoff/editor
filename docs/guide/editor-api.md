# Editor API

`createEditor()` returns one `IEditor` handle. The public API exposes canonical data and commands; it does not expose mutable block DOM or internal managers.

## Editor handle

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
  on(type: EditorEventName, listener: (payload?: unknown) => void): () => void
  destroy(): void
}
```

`save()` returns a detached canonical document. `render()` replaces the document through the same schema/migration boundary used at creation. `clear()` creates one empty default block. `undo()` and `redo()` return `false` when no matching history step exists or editing is unavailable.

## Blocks API

`editor.blocks` is identity-based; commands use block IDs, not indexes as mutation handles.

| Member | Meaning |
| --- | --- |
| `count` | Number of canonical blocks. |
| `currentId` | Current interaction block ID, or `null`. |
| `get(id)` | Immutable `EditorBlockSnapshot` by ID. |
| `at(index)` | Immutable snapshot by current order. |
| `list()` | Detached immutable snapshots in document order. |
| `indexOf(id)` | Current index of an ID, or `-1`. |
| `setCurrent(id)` | Set the interaction target. |
| `selectedIds()` | IDs selected by the transient interaction layer. |
| `select(ids)` | Set transient block selection. |
| `clearSelection()` | Clear transient block selection. |
| `insert(input, index?)` | Insert `InsertBlockInput`; returns the fresh block ID. |
| `update(id, producer)` | Apply a model-first `BlockUpdate`. |
| `remove(id)` | Remove one block. |
| `move(id, to)` | Move one ID to a final index. |
| `convert(id, target)` | Convert through registered conversion capabilities. |
| `focus(id, target?)` | Focus a logical editable field. |
| `Symbol.iterator` | Iterate immutable snapshots. |

## Immutable snapshots

`EditorBlockSnapshot` contains `id`, `type`, `dataVersion`, `data`, optional `tunes`, optional `inline`, optional `revision`, and activation `status`.

Snapshots never expose the mounted `element`. DOM is a projection of canonical state, not a persistence API. Use block IDs plus `editor.blocks` commands for host mutations.

## Events

Subscribe through `editor.on(type, listener)`. It returns an unsubscribe function.

Public event names are:

- `editor:ready`
- `editor:destroyed`
- `transaction:committed`
- `document:changed`
- `history:changed`
- `readOnly:changed`
- `currentBlock:changed`
- `selection:changed`

`currentBlock:changed` reports the current block ID only after the interaction target actually changes. `selection:changed` reports selected IDs in document order only when the selected set/order changes.

Events are observations. Application and extension code do not emit editor events.

## Lifetime

`isReady` becomes `true` after successful composition reaches the ready microtask. It is the one handle state that remains readable after `destroy()` and then returns `false`.

`destroy()` is idempotent. It aborts editor-scoped and block-scoped work, removes owned DOM/styles/listeners, and releases the holder lease.

All retained editor/block handles are revoked after destruction. Reads, writes and new subscriptions reject instead of recreating resources or exposing stale state. An unsubscribe function obtained before destruction remains safe to call.

## DOM ownership

The host owns `holder`; Rector owns the nodes placed inside it while the editor is live. Do not persist references to projected block nodes across render, conversion, undo/redo, read-only transitions or document replacement.

For advanced TypeScript contracts use `@shelamkoff/rector/types`.
