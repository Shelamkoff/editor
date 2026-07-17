# Editor API

`createEditor()` returns an `IEditor` handle. It exposes document operations, a constrained block API, typed event subscriptions, the root element, and lifecycle state. Internal mutable managers are intentionally unavailable.

## Editor handle

```ts
interface IEditor {
  save(): EditorDocument
  render(data: EditorDocument): void
  clear(): void
  focus(): void
  /** Restore exactly one previous committed history step. */
  undo(): boolean
  /** Reapply exactly one previously undone history step. */
  redo(): boolean
  setReadOnly(readOnly: boolean): void
  insertInlinePlugin(type: string, data?: Record<string, string>): boolean
  destroy(): void
  readonly isReady: boolean
  readonly readOnly: boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly blocks: EditorBlocksApi
  readonly events: EditorEventSubscriptions
  readonly rootElement: HTMLElement
}
```

After `destroy()`, `isReady` remains readable and returns `false`; calling `destroy()` again is safe. Accessing any other property or method throws `Editor instance is destroyed`.

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

Replaces the document with one empty block of `defaultBlock` type, makes it the current block, and creates one history step. The method does not request or restore browser focus. Replacing the active block detaches its DOM, so focus may be lost; call `editor.focus()` afterwards when the application needs focus to remain in the editor. Undo restores the previous complete document; redo applies the clear again.

```js
editor.clear()
editor.focus()
```

## `focus()`

Moves focus into the current editable block. It has no effect on stored data and creates no history entry.

## History controls

`undo()` restores the previous committed document step and `redo()` restores the next one. Each method returns `true` only when it performed a restore. It returns `false` when the corresponding stack is empty or the editor is read-only. `canUndo` and `canRedo` expose the same availability without changing the document.

Availability changes immediately on input: it does not wait for `tuning.undo.debounceMs` to close the coalesced typing step. A new input branch invalidates redo immediately as well.

Use `history:changed` to keep application controls synchronized. Read the getters once after creating the editor because the initial state exists before an application can subscribe.

```js
function syncHistory() {
  undoButton.disabled = !editor.canUndo
  redoButton.disabled = !editor.canRedo
}

undoButton.addEventListener('click', () => editor.undo())
redoButton.addEventListener('click', () => editor.redo())

const stopHistorySync = editor.events.on('history:changed', syncHistory)
syncHistory()
```

The configured `tuning.undo.maxStack` limits retained snapshots. New edits after an undo discard the redo branch. See [Commands and history](/guide/commands-history) for transaction boundaries and text-input coalescing.

## Editing and read-only modes

`readOnly` reports the current mode. `setReadOnly(true)` disables interactive editing on the existing instance; `setReadOnly(false)` mounts the editing infrastructure again. Passing the current value is a no-op. Passing a non-boolean value throws a `TypeError`.

```js
editor.setReadOnly(true)
console.log(editor.readOnly) // true

editor.setReadOnly(false)
```

A mode transition commits pending text input, rebuilds plugin DOM with the new `BlockMutationContext.readOnly` value, and mounts or releases edit-only managers. The document and history stacks are preserved. The transition does not create a history step, emit a document-change notification, call `onChange`, or request or restore browser focus. Because mounted plugin elements are replaced, current focus may be lost; call `editor.focus()` after returning to edit mode when required. It emits `readOnly:changed`, followed by `history:changed` because history controls are unavailable while read-only.

Read-only mode blocks user editing, plugin mutation controls, inline insertion, and history restoration. Host-authorized document methods (`save()`, `render()`, `clear()`, and `editor.blocks` structural commands) remain available so an application can load or replace content. Use the document renderer instead when no editor lifecycle or programmatic editing API is required.

Programmatic document mutations performed while read-only are still recorded in history. `canUndo` and `canRedo` remain `false` and `undo()`/`redo()` remain unavailable until `setReadOnly(false)` restores editing; the recorded steps can then be restored normally.

Because a transition destroys and recreates each plugin's mounted element, application code must not retain plugin-owned DOM nodes. Custom plugins must release element-specific listeners and resources in `destroy(element)` and derive interactive controls from `context.readOnly` each time `render(data, context)` runs.

## `insertInlinePlugin(type, data?)`

Inserts a registered inline widget at the current caret or activates its custom insertion flow. Returns `false` when the editor is read-only, the type is unknown, or no suitable caret exists.

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

This is the public `Symbol.iterator` implementation of `EditorBlocksApi`; prefer the `for...of` form above instead of invoking it directly.

### Selection and focus commands

```js
editor.blocks.setCurrentIndex(0)
editor.blocks.selectBlocks(['intro', 'body'])
editor.blocks.clearSelection()
```

`selectBlocks()` and `clearSelection()` emit `block:selected` only when the selected block IDs actually change. The payload contains the selected IDs in document order. `setCurrentIndex()` changes the current block used by keyboard operations, but does not change block selection and does not emit `block:selected`. `EditorBlockView.focus()` focuses that block; `isEmpty()` delegates to the plugin's emptiness contract.

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
| `block:selected` | `{ blockIds }` | user or Blocks API selection changed |
| `editor:ready` | none | composition completed |
| `editor:willChange` | none | outer command begins |
| `editor:changed` | none | command mutation committed |
| `history:commit` | none | one history step committed |
| `history:changed` | `{ canUndo, canRedo }` | public history availability changed |
| `readOnly:changed` | `{ readOnly }` | `setReadOnly()` completed a mode transition |
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

## TypeScript entry points

Use `import type` for contracts that are erased from emitted JavaScript:

```ts
import type {
  EditorConfig,
  EditorDocument,
  IEditor,
} from '@shelamkoff/rector'
import type {
  EditorTuning,
  InlinePlugin,
  InlinePluginContext,
} from '@shelamkoff/rector/types'
```

`@shelamkoff/rector` is the normal application entry and re-exports the supported editor types. `@shelamkoff/rector/core` exposes the same editor runtime without the root convenience exports. `@shelamkoff/rector/types` is a type-only entry for extension authors and advanced adapters; it has no JavaScript runtime.

The public declarations are grouped by responsibility:

| Area | Main contracts |
| --- | --- |
| document and configuration | `EditorDocument`, `BlockData`, `EditorConfig`, `EditorTuning`, `DocumentMigration` |
| diagnostics and validation | `EditorDiagnostic`, `EditorDiagnosticCode`, `DiagnosticThresholds`, `BlockValidationIssue` |
| block extensions | `BasePlugin`, `BlockPlugin`, `BlockMutationContext`, `BlockPluginConstructor`, `PluginRuntimeConfig`, `ToolboxEntry`, `PasteConfig`, `PasteEvent`, `TagPasteEvent`, `FilePasteEvent`, `PatternPasteEvent`, `ShortcutEntry`, `InlineControlContext`, `InlineControlGroup` |
| inline extensions | `InlineTool`, `InlineToolActionContext`, `InlineMutationContext`, `InlinePlugin`, `InlinePluginContext`, `InlineSelection`, `IInlinePluginRegistry` |
| application integration | `IEditor`, `EditorBlocksApi`, `EditorBlockView`, `EditorEventSubscriptions`, `EditorEvents`, `CaretPosition` |
| advanced composition | `IBlock`, `IBlockReader`, `IBlockManager`, `ISelectionManager`, `IBlockOperations`, `IEventBus`, `ICrossBlockSelection`, `IScopedI18n` |
| localization | `LocaleValue`, `PluralForms`, `I18nMessages`, `MessageKey` |

Application code normally needs only `IEditor`, `EditorConfig`, `EditorDocument`, and the extension contracts it implements. The manager interfaces describe dependency boundaries used by advanced composition, adapters, and tests. They do not make the editor's internal manager instances available from `createEditor()`; use `editor.blocks`, `editor.events`, and the documented `IEditor` methods for normal integration.

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
