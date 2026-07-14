# Editor API

`createEditor()` returns an `IEditor` handle. It exposes document operations, a constrained block API, typed event subscriptions, the root element, and lifecycle state. Internal mutable managers are intentionally unavailable.

## Editor handle

```ts
interface IEditor {
  save(): EditorDocument
  render(data: EditorDocument): void
  clear(): void
  focus(): void
  insertInlinePlugin(type: string, data?: Record<string, string>): boolean
  destroy(): void
  readonly isReady: boolean
  readonly blocks: EditorBlocksApi
  readonly events: EditorEventSubscriptions
  readonly rootElement: HTMLElement
}
```

Except for an idempotent `destroy()`, accessing the handle after destruction throws `Editor instance is destroyed`.

## `save()`

Serializes every block, validates plugin data, marshals inline widgets, and returns a detached `EditorDocument`. Saving is synchronous because block plugin `save()` methods are synchronous. Serialization and validation failures are thrown to the caller.

```js
try {
  const document = editor.save()
  await storage.put(document)
} catch (error) {
  reportSaveFailure(error)
}
```

In strict validation mode, invalid block data throws before a document is returned. A plugin save failure is reported through diagnostics when enabled and is rethrown to the caller. If the application persists asynchronously, pass the returned snapshot to its asynchronous storage API as shown above.

## `render(data)`

Normalizes and replaces the complete live document. The operation is all-or-nothing: Rector prepares the replacement before committing it. It creates one history step and focuses the restored caret when supplied internally, otherwise the end of the first block. Use it after loading or selecting another document.

```js
editor.render(documentFromStorage)
```

Do not call `render()` to update one block. Use the block API or the mutation context of the owning plugin.

## `clear()`

Replaces the document with one empty block of `defaultBlock` type, makes it the current block, and creates one history step. It does not move browser focus; call `editor.focus()` afterwards when the application wants that behavior. Undo restores the previous complete document; redo applies the clear again.

```js
editor.clear()
editor.focus()
```

## `focus()`

Moves focus into the current editable block. It has no effect on stored data and creates no history entry.

## `insertInlinePlugin(type, data?)`

Inserts a registered inline widget at the current caret or activates its custom insertion flow. Returns `false` when the type is unknown or no suitable caret exists.

```js
const inserted = editor.insertInlinePlugin('mention', {
  id: '42',
  name: 'Ada',
})
```

The plugin owns the exact data keys. Consult its reference page before calling this method.

## `rootElement`

Returns Rector's root element inside the holder. Use it for layout integration, scoped application styles, or accessibility relationships. Do not remove, reorder, or replace Rector-owned descendants.

## Blocks API

`editor.blocks` contains queries and structural commands. Returned `EditorBlockView` objects expose identity and safe view state but omit destructive internal methods.

### Queries

| Method | Result |
| --- | --- |
| `getBlockByIndex(index)` | block at an ordered index or `undefined` |
| `getBlockById(id)` | block with a stable id or `undefined` |
| `getCurrentBlock()` | current block or `undefined` |
| `getCurrentIndex()` | current ordered index; may be `-1` while no block is current |
| `getBlockCount()` | total block count |
| `getBlockIndex(id)` | current index for an id, or `-1` when it is absent |
| `getSelectedBlocks()` | selected block views |
| `hasSelectedBlocks()` | whether a block selection exists |

The API is iterable:

```js
for (const block of editor.blocks) {
  console.log(block.id, block.type)
}
```

### Selection and focus commands

```js
editor.blocks.setCurrentIndex(0)
editor.blocks.selectBlocks(['intro', 'body'])
editor.blocks.clearSelection()
```

These methods update editor selection state. `EditorBlockView.focus()` focuses that block; `isEmpty()` delegates to the plugin's emptiness contract.

### Structural commands

```ts
insert(type, data?, index?, id?, inline?): EditorBlockView | undefined
remove(index): void
move(fromIndex, toIndex): void
convert(index, type, data?): EditorBlockView | undefined
```

`insert()` places the new block immediately after the current block when `index` is omitted; if no block is current, it uses the end of the document. It generates an id when `id` is omitted. Pass an `inline` map only when importing already serialized inline widgets.

`remove()` and `move()` use current indices. Resolve an id immediately before the operation when document order may have changed.

`convert()` asks the source plugin for exported data, merges explicitly supplied data, and mounts the target plugin while preserving block identity when conversion succeeds.

Every structural method is already a command and therefore produces its own history step. See [Commands and history](/guide/commands-history).

## Block view

```ts
interface EditorBlockView {
  readonly id: string
  readonly type: string
  readonly element: HTMLElement
  readonly contentElement: HTMLElement
  readonly focused: boolean
  readonly selected: boolean
  readonly hasInlineTools: boolean
  readonly canMerge: boolean
  readonly version: number
  focus(): void
  isEmpty(): boolean
}
```

`element` and `contentElement` are escape hatches for measurement and integration. Application code must not mutate their persisted content. `version` changes when Rector marks the block dirty and can be used as an observation token, not as a document version.

## Event subscriptions

`editor.events` exposes only `on`, `off`, and `once`. `on()` and `once()` return an unsubscribe function.

```js
const stop = editor.events.on('block:moved', ({ blockId, from, to }) => {
  console.log(blockId, from, to)
})

stop()
```

### Event catalog

| Event | Payload | When emitted |
| --- | --- | --- |
| `block:added` | `{ blockId, index }` | block inserted |
| `block:removed` | `{ blockId, index }` | block removed |
| `block:moved` | `{ blockId, from, to }` | block reordered |
| `block:converted` | `{ blockId, from, to }` | type converted |
| `block:changed` | `{ blockId }` | affected block committed |
| `block:focused` | `{ blockId }` | focus entered a block |
| `block:blurred` | `{ blockId }` | focus left a block |
| `block:selected` | `{ blockIds }` | block selection changed |
| `editor:ready` | none | composition completed |
| `editor:willChange` | none | outer command begins |
| `editor:changed` | none | command mutation committed |
| `history:commit` | none | one history step committed |
| `editor:destroyed` | none | cleanup completed |
| `toolbar:opened` | `{ type }` | block or inline toolbar opened |
| `toolbar:closed` | `{ type }` | toolbar closed |
| `paste:applied` | `{ startBlockId?, endBlockId? }` | paste transaction committed |
| `dragHandle:clicked` | none | drag handle activated |

Events are synchronous observations. Avoid expensive work inside a handler; schedule it separately. For persistence, prefer the serialized `onChange` callback.

`editor:ready` is emitted during composition, before `createEditor()` returns the public handle. A host that needs a readiness notification must pass `onReady` in the configuration; subscribing to `editor.events` after creation cannot observe that already completed event.

## Public utilities

The root entry also exports utilities used by custom integrations and extensions:

| Export | Purpose |
| --- | --- |
| `uid()` | create a six-character identifier from cryptographically secure browser randomness |
| `sanitizeHtml(html)` | retain Rector's supported inline-formatting subset and remove unsupported markup |
| `escapeHtml(text)` | convert plain text to an HTML-safe string |
| `DocumentSchema` | normalize and migrate an `EditorDocument` without mounting an editor |
| `InlinePluginRegistry` | low-level registry for a custom editor composition |
| `createDefaultInlineTools(options?)` | construct the built-in formatting tool set |
| `createColorSwatchPlugin()` | construct the color-swatch inline plugin |
| `createMentionPlugin(options?)` | construct the mention inline plugin |

`uid()` produces a candidate identifier; an application assigning ids outside the editor must still check uniqueness in its document. Use `textContent` instead of HTML whenever markup is not required. `sanitizeHtml()` is limited to Rector's formatting model and is not a general authorization boundary.

Normal editor integration does not instantiate `InlinePluginRegistry`. Pass plugin objects through `inlinePlugins` and let `createEditor()` own registration and cleanup. A manually created registry must contain unique plugin types and trigger characters and must be destroyed by its owner.

The extension factories are available from the root entry for convenience. Their documented subpath imports remain preferable when an application wants the narrowest possible dependency boundary. See [Inline tools and plugins](/guide/inline-extensions).

See [Document format](/guide/document-format) for `DocumentSchema` options and [Security and lifecycle](/guide/security-lifecycle) for sanitizer boundaries.

## Lifecycle pattern

```js
const editor = createEditor(config)
const unsubscribe = editor.events.on('history:commit', markDirty)

function disposeView() {
  unsubscribe()
  editor.destroy()
}
```

Destroying an editor also destroys its registered plugin instances. Do not reuse those same plugin objects in a later editor; create new instances.
