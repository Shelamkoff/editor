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

`InlineSelection.textAlign` describes the current canonical alignment of the eligible selected blocks: `left`, `center`, `right`, `justify`, or `mixed`. Tools may read it to refresh their icon, title, and active state without opening an action panel.

`InlineToolActionContext` contains `range`, `mutate(operation)`, `getTextAlign()`, `setTextAlign(value)`, `restoreSelection()`, `close()`, `showTooltip(anchor, label, shortcut?)`, `hideTooltip()`, and the optional localized `backLabel`. Closing an action panel restores its saved document selection. A new document selection, panel closure, document replacement, replacement of any selected block instance, read-only mode, destruction, or a failed factory revokes the context. Retained callbacks cannot invoke their producers, query successor alignment, restore selection, close a later panel, or show its tooltips.

When an action panel opens, the toolbar focuses its first enabled input or button unless the panel already owns focus. `Escape` from any panel control closes it and returns the saved document selection; a control can claim `Escape` with `preventDefault()` or `stopPropagation()`. Revoked panels cannot restore focus or close a later panel.

Core calls `bindSelectionPort(port)` when mounting a tool and `bindSelectionPort(null)` when destroying it. The port supplies the live cross-field range; each editor needs its own mutable tool instances.

`InlineMutationContext` exposes `mutate(range, operation)` for mounted tool controls. Its optional `restoreSelection()` returns focus and the current editor-owned range after canceling an auxiliary panel, without writing data or history; it returns `false` when editing or a valid selection is unavailable.

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

An author may also type the literal characters `{{id}}` where that ID is already owned by a widget. Rector persists this *ordinary text*, without creating a second reference, as `<span class="oe-inline-literal">{{id}}</span>` in canonical rich-text HTML. The class is a reserved internal serialization marker, not an extension API or visual style. Sanitization, selection offsets, ID remapping and rendering preserve the literal text; only the unmarked owned token counts as an inline reference. Extension code must not add or remove this marker to impersonate a widget.

## Runtime and widget instance

The host sets and maintains `data-inline-plugin` and `data-id` on the instance's stable root element. Extensions do not need to write these markers. They support atomic editing coordinates: a widget occupies one parent-field unit regardless of label length. Private runtime ownership controls serialization; copying these DOM attributes does not create a widget or payload. The widget still owns its content and editable/read-only presentation.

After full schema normalization, canonical assembly counts owned references in text nodes across every rich field, including hidden fields. Duplicate owned occurrences reject the edit. Attribute tokens and unowned literal tokens do not count. Referenced unloaded payloads survive; only unreferenced entries are pruned during semantic edits.

`InlinePluginRuntimeContext` provides `ownerDocument`, `signal`, `t(key, fallback, params?)`, and `showPopup(anchor, content, cleanup?)`. Translation parameters replace placeholders such as `{level}` through the editor's shared dictionary. `showPopup()` returns a frozen `{ close(): void }` handle for that presentation. Retain the initiating handle in callbacks; closing a stale handle cannot close a successor or another extension's popup. The host closes popups on outside click, anchor removal, read-only transition and destruction.

Anchor/content must be HTML elements from the owning document and cleanup must be a function when supplied. Popup content must be a disconnected surface, not a node already attached anywhere in the document (including the editor root and the anchor); Rector rejects such requests rather than moving editor controls into a transient popup. Invalid arguments reject before replacement. An unavailable anchor or interaction returns an already closed handle and attempts cleanup once. Cleanup runs after retirement under observation authority; it cannot mutate the document, controls or tasks. Errors and asynchronous completion are contained. A newer popup opened by reentrant cleanup wins over the superseded outer request.

`InlinePluginRuntime` provides `create(id, initial, context)`, optional `onTriggerQuery(session)`, optional `onTriggerKeydown(event, session)`, optional `onTriggerCancel()`, and `destroy()`.

Each `create()` returns an `InlineWidgetInstance` with `element`, optional `update(next, previous)`, `setReadOnly(readOnly)`, optional `focus()`, and `destroy()`. Its `element` must be a fresh detached `HTMLElement` belonging to the editor's `ownerDocument`; it is exclusively owned by that occurrence until cleanup finishes. Connected, foreign-document, parented, or still-owned elements are rejected. A rejected duplicate borrow does not invoke the original owner's `destroy()`. If the definition opts into native inline deletion via `editing.reconcileNative`, a synchronous `update(next, previous)` is **required**. An instance may also supply synchronous `afterNativeEdit(notice)` for transient UI/search updates; that notice runs under observation authority and is not a command.

`InlineWidgetContext` provides exactly `id`, `blockId`, `fieldKey`, `signal`, `getData()`, `updateData(producer)`, `commitDomMutation(operation)`, `beginTask()`, and `isReadOnly()`. Inline ID allocation remains with the host.

`commitDomMutation()` synchronously edits the owning registered rich field/occurrence, then core serializes the complete block into the existing transaction. A canonical change creates one Undo step; an equal result creates none. Failure, a Promise/thenable or a throwing `then` accessor restores the committed projection and selection; failed recovery retains failed-health behavior. Revoked/read-only/unhealthy scopes do not invoke the callback; staged or protected reentry rejects before invocation. Use `updateData()` for payload changes and `beginTask()` for asynchronous work. Do not schedule later DOM work from the protected callback.

## Trigger sessions

A definition may declare one Unicode-code-point `trigger`. Core owns the trigger range and passes a transient `InlineTriggerSession` to the runtime. Search/pagination UI is transient; `session.commit(data)` is the canonical insertion boundary.

A trigger session is invalidated by focus changes, document replacement, read-only transitions, destruction, or a newer session. Retained UI callbacks must become inert.

## Paste and fresh insertion

`paste.patterns` declares textual patterns; `fromMatch(match)` returns canonical widget data or `null`.

`insertion.createInitial()` supports programmatic insertion through `editor.insertInlinePlugin(type, data?)`. It returns either a widget payload or literal text.

`editing.handle(input, data)` handles model-first editing around committed widgets. It returns `null` to pass or a synchronous `update`, `remove`, or `replace-text` action. Actions may include an optional non-negative `caret` measured in local UTF-16 label units; this is a position result, not native Range authority. Its input and output are prepared under the runtime's command guard; invalid or asynchronous owned decisions are consumed without native fallback.

Optionally, `editing.reconcileNative({ inputType, beforeText, text }, data)` opts a label into native `deleteContentBackward/Forward`, `deleteWordBackward/Forward`, and `deleteSoftLineBackward/Forward` reconciliation. It must be pure and synchronous and **must return an action**, not `null`. The editor owns one pending input record, captures all occurrences within the current rich field and reconciles the observed neighboring text, inline payload, and live instance in one atomic projection transaction. Removed labels retire their identity; a surviving instance receives the final normalized payload through `update()`. `afterNativeEdit({ inputType, text, labelChanged, caret })` is a post-settlement observation, with `caret` a label-local UTF-16 offset or `null`. Missing or invalid native intervals never authorize guessed word boundaries or edits in another field.

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
