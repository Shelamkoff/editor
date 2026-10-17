# Creating extensions

Rector v2 uses immutable definitions. A definition is reusable configuration plus schemas and pure capabilities; mutable editor state is created by `setup()`, and mutable block state is created by `runtime.create()`.

## Block definition

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

| Member | Meaning |
| --- | --- |
| `type` | Stable machine identifier persisted in documents. |
| `label` | Localizable UI label key and fallback. |
| `icon` | Trusted extension-owned icon markup. |
| `styles` | Style URLs owned by the definition. |
| `toolbox` | Optional insertion variants. |
| `schema` | Versioned canonical data contract. |
| `capabilities` | Pure optional behavior contracts. |
| `setup` | Creates one per-editor runtime. |

## Runtime and block instance

`BlockPluginRuntime` has `create(initial, context)` and `destroy()`. Each `create()` returns one `BlockInstance`.

`read()` supplies current collection membership/order and control values. `editableFields()` lists only mounted fields; `mapRichText()` must enumerate every rich field, including hidden fields, under unique nonempty stable keys. Every returned editable field must be an `HTMLElement` inside that block instance's own root and in the editor's `ownerDocument`; text, comment, SVG and other non-HTML nodes cannot act as editable hosts. Referencing another block's field or an application's external DOM node rejects before any field address is registered. Mounted keys must be unique across modes, elements cannot be shared between keys, and every mounted rich field must exist in the candidate data. Invalid addressing rejects synchronization and restores the committed projection.

During DOM synchronization, mounted rich fields come from their DOM, hidden existing fields retain their committed canonical value (including empty strings), and new hidden fields retain their candidate value. Removed fields stay removed. Model-first `updateData()` can deliberately change hidden values. Flush pending DOM input with `commitDomMutation(() => {})` before presentation controls unmount its field; never copy rendered widget labels into a canonical rich-text cache.

A `BlockInstance` exposes `element`, `read()`, optional `update(next, previous)`, optional `editableFields()`, `setReadOnly(readOnly)`, optional `focus(target)`, and `destroy()`. The `element` must belong to the context's `ownerDocument` and be detached, with no parent, when returned by `create()`. It must be an `HTMLElement` in that document's realm; other node types (including comments, text nodes and SVG elements) are not valid block roots. Each simultaneously live block instance owns a different DOM root; returning an existing application node or a root still owned by another block is rejected.

`BlockInstanceContext` provides:

| Member | Use |
| --- | --- |
| `ownerDocument` | Create DOM and browser objects in the editor's realm. |
| `signal` | Abort signal for this block occurrence. |
| `getData()` | Read current canonical block data. |
| `updateData(producer)` | Commit a synchronous model-first block-data transaction. |
| `beginTask()` | Create revocable authority for one asynchronous persisted result. |
| `commitDomMutation(operation)` | Commit an unavoidable plugin-owned DOM mutation through canonical history. |
| `requestSplit()` | Ask core structural editing to split the block. |
| `requestExit()` | Ask core to exit an empty structured block. |
| `isReadOnly()` | Current mutation eligibility. |

The inherited `createId(prefix)` allocator creates nested stable identities.

## Schema

Payload generics use `D extends object = object`: ordinary interfaces do not need index signatures. Schemas, definitions, contexts/tasks and paired renderers accept the same interface type, including host insertion/update inputs. This typing does not relax JSON validation: root arrays, class instances, cycles, undefined properties and nonfinite numbers still reject.

Schema/capability hooks, `setup()`, `create()` and instance methods must complete synchronously. Promise/callable-thenable results and throwing `then` getters fail at their owner; projection changes recover before canonical commit. Void hooks may return ignored synchronous values. Keep asynchronous persisted work in `beginTask()`; declared paste resolvers retain their asynchronous contract. Lifecycle cleanup revokes authority first and contains failures without skipping independent cleanup.

`BlockDataSchema` owns `currentVersion`, `createDefault()`, exact-version `decode()`, `encode()`, and optional `mapRichText()`.

Decode external input once at the boundary. Encode every model-first update before commit. `mapRichText()` identifies every HTML-bearing field by a stable logical field key; it is also the boundary used by inline widgets, structural selection and partial conversion.

## Capabilities

`BlockCapabilities` can contain `empty`, `formatting`, `merge`, `conversion`, `htmlImport`, `clipboard`, `selectionSlice`, `inlineControls`, `settings`, `paste`, and `shortcuts`.

- `empty.isEmpty(data)` defines structural empty-block behavior.
- `formatting.inlineTools` is `true` or an allowlist.
- `merge.merge(target, source)` is a pure data merge.
- `conversion` exports/imports neutral `ConversionPayload`. Its `selectionMode` controls cross-block conversion: `'single'` (the default) replaces the selected interval with one default target; `'per-block'` imports each selected source fragment separately. Caption import does not imply text-style grouping. Both modes preserve unselected endpoint data and use one Undo action. Declare `'per-block'` only when each fragment is meaningful as an independent target; unsupported imports reject before mutation.
  A single target may declare `joinSelection(payloads, { ownerDocument })` to aggregate the selected author content before import. Code uses this hook to create one block with decoded text and line breaks. The registry snapshots the method; core validates the result and rejects inline-widget loss before any mutation. Already matching text owners retain their local fields, metadata and identities rather than being re-imported through neutral text.
- `selectionSlice.slice(...)` describes partial structured selection without mutating DOM.
- `inlineControls` reuses model-first settings actions inside the inline toolbar.
- `settings` is either an actions capability or a model-first panel.
- `htmlImport.matchesRoot/importRoot` synchronously imports one safe structural HTML root into local current data for that block type; it must consume the whole root and have no side effects. Optional `inlineWhenSingleRoot: true` lets the importer opt into replacing a selected rich-text range when that root is the sole content in the clipboard. The default is `false`, so third-party importers keep their block semantics. The flag is captured and validated at registration; multi-root imports remain structural.
- `ClipboardCapability` (`clipboard.slice(data, context)`) lets a composite block return exported `parts`, the canonical `remaining` value after Cut, and an optional `focus`. `context.field(key)` exposes only actually selected rich-text intervals (`before/selected/after/whole`). Export and remaining come from the same pure capability, so core never guesses the block's data shape.
- `paste` routes only text/file inputs to block or rich-text results; structural HTML is not passed to it.
- `shortcuts` returns structural/model actions to the single core keyboard router.

Shortcut decisions run under the shared preparation guard with detached input/data, captured canonical rich fields and one mounted field-length table. `splitField()` keeps that captured text even if the callback is retained; `fieldLength()` returns zero for missing/unmounted fields. Allocation uses the session allocator. Return `null` for generic handling, `native` for owned native handling, or `consume` to cancel without an edit. `update`, `exit` and `focus` cancel native default before application. A thrown/invalid/thenable result or failing accessor cancels the owned key and reports the error without generic/native fallback.

## Settings, paste and shortcuts

`SettingsActionCapability` has `kind`, `actions(data, context)`, and `apply(data, actionId, context)`. Its optional localized `label` names the group in the inline toolbar; actions with a boolean `active` expose their selected state as radio menu items.

`SettingsPanelCapability` has `kind: 'panel'` and `render(context)`; its context exposes `getData()` and `updateData()`. The context belongs to that panel and mounted block instance. Closing the panel, replacing its owner, entering read-only mode, destruction, or a failed factory revokes it permanently: retained producers are not invoked, and `getData()` returns only its last owned snapshot.

`HtmlImportCapability` has `matchesRoot(element)`, `importRoot(element, context)`, and optional `inlineWhenSingleRoot: boolean`. Its context exposes `ownerDocument`, `createId()`, and `serializeRichText(element)` using the normal rich-text codec. The built-in Paragraph importer opts in to v1's single-paragraph inline Paste; custom importers must opt in explicitly or their prepared block remains authoritative. Core sanitizes and plans the complete HTML input first; if any accepted root fails, the entire import is rejected before mutation.

`PasteCapability` has `accepts(input)` and `resolve(input, context)` for text/file input only. The resolver receives `AbortSignal`, `ownerDocument`, and `createId()`.

`ShortcutCapability` has one `handle(input, data, context)` method. Return `native`, `consume`, `exit`, `focus`, or `update`; core owns the actual structural transaction.

Its context provides `createId()`, `splitField(fieldKey, range)`, and `fieldLength(fieldKey)`. Field lengths use logical UTF-16 units, with one unit per line break or atomic widget. Use the original target field length to keep a merge caret at the join rather than the end of the merged text. An `update` action returns block data plus an optional focus target; core records that target for Undo/Redo. An `exit` action without data converts the current block to the default type. With `data`, it updates the retained block and inserts a default block immediately after it as one history entry; list-like tools use this to exit their last empty item.

`SelectionSliceCapability` has `slice(data, start, end, context)` and returns `before`, a neutral `selected` payload, and `after`.

## Minimal definition

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

## Ownership rules

Definitions are immutable and reusable. Per-editor timers, caches and subscriptions belong to `BlockPluginRuntime`; per-block listeners, observers, requests and object URLs belong to `BlockInstance` and its `signal`.

Never persist DOM as data. Synchronous explicit controls should call `updateData()`; native editable-field input is reconciled by core. For asynchronous work that later changes persisted data, use the `DataTask` contract: capture `const task = context.beginTask()`, pass `task.signal` to the external operation, and finish with `task.commit(current => next)`. The producer runs only while the same instance authority is still live and receives the latest committed data. Replacement/destroy, a generation change, or `readOnly: false → true` revokes the task; returning to editable mode never revives an older task. `cancel()` is idempotent. Presentation-only requests that do not persist document data may use the ordinary lifecycle `signal`. For an asynchronous result that completes the immediately preceding edit of the same data field, a plugin may explicitly call `task.commit(producer, { mergeWithPreviousField: 'url' })`. The task captures its starting canonical revision. Core joins the completion to that Undo step only if no other edit or history replay intervened and the preceding transaction actually changed the named field. Otherwise the result is committed as its own history step. Never use this option to merge unrelated commands or to bypass the task's usual revocation checks.

## Renderer pairing

A new persisted block type should have a read-only renderer with the same type/schema semantics. Renderer DOM is independent from editor `BlockInstance` DOM.
