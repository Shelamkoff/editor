# Inline tools and inline plugins

Rector has two separate inline extension models: formatting tools modify a selected rich-text range, while inline plugin definitions persist structured widgets in the block's canonical `inline` map.

## Inline tool contract

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

`InlineToolActionContext` contains `range`, `mutate(operation)`, `getTextAlign()`, `setTextAlign(value)`, `restoreSelection()`, `close()`, `showTooltip(anchor, label)`, and `hideTooltip()`. Any new selection change revokes the saved toolbar lease, so a retained action context cannot mutate a newer selection.

Core calls `bindSelectionPort(port)` when mounting a tool and `bindSelectionPort(null)` when destroying it. The port supplies the live cross-field range; each editor needs its own mutable tool instances.

`InlineMutationContext` exposes `mutate(range, operation)` for mounted tool controls.

Formatting tools do not own separate persisted payloads. One selection may span multiple registered rich-text fields in one or more blocks; a tool is eligible only when every touched block allows it. The DOM edit crosses one protected transaction boundary and is normalized back into every affected block. Registered `plain-text` fields and auxiliary native controls are never partially formatted. Alignment is model-first: `setTextAlign()` changes only block `tunes.textAlign`, never wrapper CSS or plugin `data.align`.

The built-in preset exposes `bold`, `italic`, `strikethrough`, `link`, `code`, `marker`, `bgcolor`, `fontSize`, `script`, `align`, `caseTransform`, and `clearFormatting`.

## Inline plugin definition

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

The widget ID is owned by the document model. Rich text stores a `{{id}}` reference; the block's `inline[id]` record stores type, data version and data. Projection DOM is reconstructed from that canonical pair.

## Runtime and widget instance

`InlinePluginRuntimeContext` provides `ownerDocument`, `signal`, `t(key, fallback, params?)`, `showPopup(anchor, content, cleanup)`, and `hidePopup()`. Translation parameters replace placeholders such as `{level}` through the editor's shared dictionary.

`InlinePluginRuntime` provides `create(id, initial, context)`, optional `onTriggerQuery(session)`, optional `onTriggerKeydown(event, session)`, optional `onTriggerCancel()`, and `destroy()`.

Each `create()` returns an `InlineWidgetInstance` with `element`, optional `update(next, previous)`, `setReadOnly(readOnly)`, optional `focus()`, and `destroy()`.

`InlineWidgetContext` provides `id`, `blockId`, `fieldKey`, `signal`, `getData()`, `updateData(producer)`, `beginTask()`, and `isReadOnly()`.

## Trigger sessions

A definition may declare one Unicode-code-point `trigger`. Core owns the trigger range and passes a transient `InlineTriggerSession` to the runtime. Search/pagination UI is transient; `session.commit(data)` is the canonical insertion boundary.

A trigger session is invalidated by focus changes, document replacement, read-only transitions, destruction, or a newer session. Retained UI callbacks must become inert.

## Paste and fresh insertion

`paste.patterns` declares textual patterns; `fromMatch(match)` returns canonical widget data or `null`.

`insertion.createInitial()` supports programmatic insertion through `editor.insertInlinePlugin(type, data?)`. It returns either a widget payload or literal text.

`editing.handle(input, data)` handles model-first editing around committed widgets. It may return `update`, `remove`, or `replace-text`.

## Example registration

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

For read-only output, register separate `InlineWidgetRenderer` definitions with `EditorRenderer.inlineRenderers`. The editor runtime is never reused as a renderer persistence API.

## Ownership and security

Create DOM in `ownerDocument`, attach block/widget listeners to the supplied `signal`, and keep popup cleanup in the supplied popup host. Never derive widget data from arbitrary DOM attributes; `getData()` is the canonical source.

Treat search results and consumer labels as text. Only package-owned icons enter trusted markup sinks.
