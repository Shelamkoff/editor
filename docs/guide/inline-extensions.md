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
  bindSelectionPort?(port: InlineSelectionPort | null): void
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

Core calls `bindSelectionPort(port)` when mounting a tool and `bindSelectionPort(null)` when destroying it. `InlineSelectionPort.range` is a fresh view of the current author range, not a durable mutation right. `capture(range?)` issues an opaque `InlineSelectionBookmark` only when the supplied endpoints match the current registered field occurrences and logical positions. Equivalent text and parent boundaries are accepted; matching text in another interval or another field is not. Each editor needs its own mutable tool instances.

`InlineMutationContext` exposes `mutate(bookmark, operation)` for mounted tool controls. Capture the opaque bookmark through that mounted tool's selection port; a raw `Range` does not authorize mutation. Its optional `restoreSelection(bookmark)` restores that same current right without writing data or history and returns `false` for foreign, replaced or retired owners. `port.restore(bookmark, { endOffsetDelta })` adjusts the original DOM-order end in UTF-16 units only inside the owning formatting mutation; the adjustment is non-cumulative and preserves the original direction. An action panel instead uses its own `InlineToolActionContext.range`, `mutate(operation)` and `restoreSelection()` throughout the action, never a bookmark borrowed from the mounted button.

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
  toText?(data: Readonly<Data>): string
  readonly paste?: InlineWidgetPasteCapability<Data>
  readonly editing?: InlineWidgetEditCapability<Data>
  readonly insertion?: { createInitial(): InlineFreshInsertion<Data> }
  setup(context: InlinePluginRuntimeContext): InlinePluginRuntime<Data>
}
```

The widget ID is owned by the document model. Rich text stores a `{{id}}` reference; the block's `inline[id]` record stores type, data version and data. Projection DOM is reconstructed from that canonical pair.

When an inline extension is not installed, its canonical `{{id}}` reference and opaque sidecar data remain preserved. The editor presents the same token characters inside an inert, non-editable, one-caret-unit placeholder; it does not start the missing extension or reinterpret the reference as author-typed literal text. Without a matching inline sidecar entry, `{{id}}` is ordinary editable text instead. These editor placeholders are internal DOM ownership markers, not a persisted HTML tag or an extension API.

An author may also type the literal characters `{{id}}` where that ID is already owned by a widget. Rector persists this *ordinary text*, without creating a second reference, as `<span class="oe-inline-literal">{{id}}</span>` in canonical rich-text HTML. The class is a reserved internal serialization marker, not an extension API or visual style. Sanitization, selection offsets, ID remapping and rendering preserve the literal text; only the unmarked owned token counts as an inline reference. Extension code must not add or remove this marker to impersonate a widget.

For multi-field blocks, a canonical inline reference may belong to a hidden rich-text field whose DOM is not currently mounted. Rector protects matching author-typed literals in *other* mounted fields without rewriting the hidden field's reference or opaque payload. An inline sidecar entry with **no** canonical reference is not permission to revive that widget through coincidentally matching typed text; its ID is also protected as a literal until canonical assembly can prune the unreferenced entry. Field serialization order must not affect these rules.

### Canonical text without a widget instance

An optional pure synchronous `toText(data)` gives block-level label consumers a widget's canonical plain text. For example, a badge definition can include:

```js
toText(data) {
  return data.label
}
```

The editor captures this method once with its original definition receiver. Its argument is an owned, deeply frozen payload decoded through the captured schema. Return a string synchronously; promises, callable thenables, other result types and thrown values reject the owning operation through its existing recovery path. The callback receives no runtime or DOM context and must not create widgets, make provider requests, mutate document state or acquire tasks.

Block instances request this text through [`context.getFieldText(fieldKey)`](./extensions#canonical-text-for-unmounted-fields). The common parser handles real references, literal tokens and entities; the block never decodes a particular inline type. The returned string is plain text and is not parsed again. An unknown definition or one without `toText` retains its canonical token characters in this derived text. Mention includes its configured trigger and name; Color returns its canonical color value. Actual mounted presentation, including transient or mode-specific labels, remains owned by widget projection and `afterProjection`.

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
