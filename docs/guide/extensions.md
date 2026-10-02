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

A `BlockInstance` exposes `element`, `read()`, optional `update(next, previous)`, optional `editableFields()`, `setReadOnly(readOnly)`, optional `focus(target)`, and `destroy()`.

`BlockInstanceContext` provides:

| Member | Use |
| --- | --- |
| `ownerDocument` | Create DOM and browser objects in the editor's realm. |
| `signal` | Abort signal for this block occurrence. |
| `getData()` | Read current canonical block data. |
| `updateData(producer)` | Commit a model-first block-data transaction. |
| `commitDomMutation(operation)` | Commit an unavoidable plugin-owned DOM mutation through canonical history. |
| `requestSplit()` | Ask core structural editing to split the block. |
| `requestExit()` | Ask core to exit an empty structured block. |
| `isReadOnly()` | Current mutation eligibility. |

The inherited `createId(prefix)` allocator creates nested stable identities.

## Schema

`BlockDataSchema` owns `currentVersion`, `legacyVersion`, `createDefault()`, `decode()`, `encode()`, and optional `mapRichText()`.

Decode external input once at the boundary. Encode every model-first update before commit. `mapRichText()` identifies every HTML-bearing field by a stable logical field key; it is also the boundary used by inline widgets, structural selection and partial conversion.

## Capabilities

`BlockCapabilities` can contain `empty`, `formatting`, `merge`, `conversion`, `selectionSlice`, `inlineControls`, `settings`, `paste`, and `shortcuts`.

- `empty.isEmpty(data)` defines structural empty-block behavior.
- `formatting.inlineTools` is `true` or an allowlist.
- `merge.merge(target, source)` is a pure data merge.
- `conversion` exports/imports neutral `ConversionPayload`.
- `selectionSlice.slice(...)` describes partial structured selection without mutating DOM.
- `inlineControls` reuses model-first settings actions inside the inline toolbar.
- `settings` is either an actions capability or a model-first panel.
- `paste` routes text/HTML/files to block or rich-text results.
- `shortcuts` returns structural/model actions to the single core keyboard router.

## Settings, paste and shortcuts

`SettingsActionCapability` has `kind`, `actions(data, context)`, and `apply(data, actionId, context)`.

`SettingsPanelCapability` has `kind: 'panel'` and `render(context)`; its context exposes `getData()` and `updateData()`.

`PasteCapability` has `accepts(input)` and `resolve(input, context)`. The resolver receives `AbortSignal`, `ownerDocument`, and `createId()`.

`ShortcutCapability` has one `handle(input, data, context)` method. Return `native`, `consume`, `exit`, `focus`, or `update`; core owns the actual structural transaction.

`SelectionSliceCapability` has `slice(data, start, end, context)` and returns `before`, a neutral `selected` payload, and `after`.

## Minimal definition

```js
export function createCalloutPlugin() {
  const schema = Object.freeze({
    currentVersion: 1,
    legacyVersion: 1,
    createDefault: () => ({ text: '' }),
    decode({ data }) {
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

Never persist DOM as data. Explicit controls should call `updateData()`; native editable-field input is reconciled by core. Async results must verify their signal/lifetime before committing.

## Renderer pairing

A new persisted block type should have a read-only renderer with the same type/schema semantics. Renderer DOM is independent from editor `BlockInstance` DOM.
