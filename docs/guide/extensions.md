# Creating extensions

Rector supports block plugins, inline formatting tools, persistent inline plugins, and block renderers. Choose the smallest role that owns the feature; combining unrelated roles makes serialization, history, and cleanup harder to verify.

## Choose an extension type

| Need | Extension |
| --- | --- |
| Add an ordered document unit with its own data | Block plugin |
| Format a text selection without separate payload data | Inline tool |
| Embed a persistent structured widget inside text | Inline plugin |
| Display a block outside the editor | Block renderer |

Every published block type should have both an editor plugin and a renderer with the same `type` and compatible data contract.

## Block plugin contract

The required surface is small:

```ts
interface BlockPlugin<Data> {
  readonly type: string
  readonly title: string
  readonly icon: string
  render(data: Data, context: BlockMutationContext): HTMLElement
  save(element: HTMLElement): Data
}
```

`type` is a stable machine identifier stored in documents. Never localize or silently rename it. `title` is the default visible label. `icon` is trusted extension markup and should be a fixed SVG owned by the package.

`render()` builds one block's content element. `save()` must read the same element and return JSON-compatible data. Both methods must be deterministic for equivalent input.

### Minimal text plugin

```js
import { sanitizeHtml } from '@shelamkoff/rector'

export class Callout {
  static isTextBlock = true
  static styles = [new URL('./callout.css', import.meta.url).href]

  type = 'callout'
  icon = '<svg viewBox="0 0 24 24" aria-hidden="true">...</svg>'
  inlineTools = true
  i18n = null

  setI18n(i18n) {
    this.i18n = i18n
  }

  get title() {
    return this.i18n?.t('title') ?? 'Callout'
  }

  render(data, context) {
    const root = document.createElement('aside')
    root.className = 'callout'
    root.contentEditable = 'true'
    root.innerHTML = sanitizeHtml(String(data.text ?? ''))

    // Store the context for plugin-owned buttons or handlers.
    this.context = context
    return root
  }

  save(root) {
    return { text: root.innerHTML }
  }

  validate(data) {
    return typeof data.text === 'string'
  }

  isEmpty(root) {
    return root.textContent.trim().length === 0
  }
}
```

Native edits inside `contenteditable` are tracked by Rector. A plugin-owned button, picker, toggle, completed upload, or other explicit action must use the `context.mutate()` captured by `render()`.

### Block mutation context

`BlockMutationContext` separates changes owned by a plugin from structural changes owned by the editor:

| Member | Use |
| --- | --- |
| `mutate(operation)` | Run one synchronous plugin-local change as one history step. Returns the operation result, or `undefined` in read-only mode. |
| `splitBlock()` | Insert and focus the configured default block immediately after the current block. When called inside an active `mutate()`, both the plugin cleanup and the insertion belong to the same history step. |
| `exitEmptyBlock()` | Convert the current empty non-default block to the configured default type. Returns `true` only when conversion occurred. |
| `readOnly` | `true` when controls that change the document must not be mounted or activated. |

Use `splitBlock()` for a list-like control that consumes its empty trailing item and needs to continue in a normal paragraph. Use `exitEmptyBlock()` when the structured block itself is empty. Do not dispatch synthetic keyboard events to request either operation: they can be intercepted by the plugin again and do not define a reliable command boundary. Structural methods are inert when edit-mode services are unavailable.

In read-only mode Rector disables buttons, inputs, and other controls inside a block by default. A genuinely presentation-only control may remain interactive by carrying `data-oe-read-only-interactive`, for example a copy button, carousel navigation, or a spoiler disclosure. Do not add this attribute to voting, uploads, settings, navigation with application side effects, or any action that changes serialized data. The attribute is an explicit promise that the control is safe in read-only mode; it does not make the handler safe automatically.

### Optional block capabilities

| Member | Purpose |
| --- | --- |
| `inlineTools` | use `true` for the editor-wide set, a string array for a per-block allowlist, or `false` to disable inline tools |
| `getPluginConfig()` | expose the immutable constructor configuration to Rector so shared options such as `injectStyles` and `css` can be applied without reading private fields; `BlockPluginAbstract` implements this method |
| `setPlaceholder(value)` | accept the editor-level `placeholder` for the configured default block; a placeholder supplied directly to the plugin must keep priority |
| `validate(data)` | accept or reject the plugin payload |
| `destroy(element)` | release block-local listeners and resources |
| `dispose()` | release resources shared by all blocks of this plugin when the owning editor is destroyed |
| `isEmpty(element)` | define empty-block behavior |
| `toolbox` | one or more insertion variants with initial data |
| `shortcuts` | block-scoped keyboard actions |
| `merge(element, data)` | merge the following compatible block into this one |
| `renderSettings(element)` | build block settings UI |
| `changeLevel(element, level)` | replace a level-based content element |
| `onSettingsAction(element, action)` | apply a named settings action |
| `pasteConfig` | declare handled tags, files, and text patterns |
| `onPaste(event)` | convert a matched paste into plugin data |
| `waitForPaste(element)` | wait for plugin work before paste history commits |
| `exportData(element)` | provide neutral data for block conversion |
| `splitSelection(element, range)` | describe source and transferable data when only part of a structured block is converted |
| `renderInlineControls(element, ctx)` | add block-specific inline toolbar controls |
| `mapTextFields(data, transform)` | expose every HTML-bearing field for widget marshalling |

Implement only capabilities the plugin actually owns. Optional methods are detected at runtime.

#### Runtime plugin configuration

Plugins may expose the common runtime options through `getPluginConfig()`:

```ts
interface PluginRuntimeConfig extends Record<string, unknown> {
  injectStyles?: boolean
  css?: string
}
```

`BlockPluginAbstract` copies and freezes the constructor configuration, so consumers may safely read it but cannot change a live plugin by mutating the original object. `injectStyles: false` disables the URLs declared by the plugin's static `styles` array. `css` is one additional stylesheet URL loaded after those static styles; it is not a string of CSS rules. A plugin may add its own configuration fields alongside these shared options.

#### Block-specific inline controls

`renderInlineControls(element, context)` can mount controls that apply only to the focused block:

```ts
interface InlineControlContext {
  suppressSelectionChange(): void
  mutate<T>(operation: () => T): T
  onContentElementChanged(newElement: HTMLElement): void
}

interface InlineControlGroup {
  elements: HTMLElement[]
  destroy?(): void
}
```

Return an `InlineControlGroup`, or `null` when the block has no controls in its current state. Rector mounts every item in `elements` into the block-specific part of the inline toolbar and calls `destroy()` when that group is removed. Use `mutate()` once per completed synchronous action. When a control replaces the plugin's content element, call `suppressSelectionChange()` before the replacement and `onContentElementChanged(newElement)` after it so Rector can keep block ownership and selection state consistent.

### Data-aware partial conversion

Generic text blocks can be split by their HTML selection. A structured plugin such as a list must instead define its own data boundary through `splitSelection(element, range)`:

```js
static isTextBlock = true

splitSelection(element, range) {
  const selected = readSelectedItems(element, range)
  if (selected.length === 0) return null

  const remaining = readUnselectedItems(element, range)
  return {
    remainingData: remaining.length
      ? { style: element.dataset.style, items: remaining }
      : null,
    selectedData: {
      text: selected.join('<br>'),
      items: selected,
    },
  }
}
```

The method is a pure description step: it must not mutate `element`, create blocks, move selection, or emit events. Rector applies the returned result inside the active command:

- `remainingData` replaces the source plugin data; `null` removes the consumed source block;
- `selectedData` is passed to a target whose constructor declares `static isTextBlock = true`;
- a non-text target receives only its own toolbox or selector data;
- the target is inserted immediately after the remaining source, or at the source index when the source is removed.

Return `null` when the range cannot be represented safely. Keep inline markup sanitized and preserve the same field names used by `save()` and `mapTextFields()`. The built-in List plugin is the reference implementation: selected items are removed, ordered items renumber naturally, and selected markup becomes `text` when the target is textual.

The generic fallback is intentionally limited to a plugin whose returned root
element itself has `contenteditable="true"` and whose transferable field is
`text`. It never rewrites a wrapper containing several editable descendants.
If a structured plugin omits `splitSelection()` or returns `null`, Rector leaves
the document unchanged for that partial conversion. Whole-block conversion is
still available through `exportData()`.

### Paste routing

The paste contract distinguishes tags, files, and matched text:

```ts
interface PasteConfig {
  tags?: string[]
  files?: string[]
  patterns?: RegExp[]
}

interface TagPasteEvent {
  type: 'tag'
  element: HTMLElement
  tag: string
}

interface FilePasteEvent {
  type: 'file'
  file: File
}

interface PatternPasteEvent {
  type: 'pattern'
  data: string
}

type PasteEvent = TagPasteEvent | FilePasteEvent | PatternPasteEvent
```

```js
pasteConfig = {
  tags: ['aside'],
  patterns: [/^!callout\s+/i],
}

onPaste(event) {
  if (event.type === 'tag') {
    return { text: event.element.innerHTML }
  }
  if (event.type === 'pattern') {
    return { text: event.data.replace(/^!callout\s+/i, '') }
  }
  return null
}
```

File patterns use MIME expressions such as `image/*`. Treat clipboard HTML, text, and files as untrusted input. `onPaste()` returns plugin data; it must not insert a block or emit events itself.

#### Block shortcuts

```ts
interface ShortcutEntry {
  combo: string
  handler(contentElement: HTMLElement): void
}
```

Each item in `shortcuts` registers a normalized combination such as `Ctrl+Shift+K`. Rector prevents the browser default, passes the current block's content element to `handler()`, and runs the handler inside one plugin mutation transaction. Keep a shortcut handler synchronous. If it starts asynchronous work, capture the block's `BlockMutationContext` in `render()` and call `context.mutate()` only when that work completes.

### Text field mapping

A text-carrying plugin that supports persistent inline widgets must map every HTML-bearing field:

```js
mapTextFields(data, transform) {
  data.text = transform(data.text)
}
```

For a list, map every item; for a quote, map both text and caption when both allow inline widgets. The matching renderer must mirror the same fields.

## Inline tool contract

An inline tool observes a saved selection and toggles formatting. At minimum it provides `type`, `icon`, `isActive(selection)`, and `toggle(selection)`.

For a one-tag formatter, use the public `createSimpleInlineTool()` factory. Implement the full object contract only when the tool needs a value panel, dynamic button state, or a mounted dropdown.

Use `renderActions(ctx)` for a panel such as a link form or color picker. Use `onMount(button, mutations)` only when a mounted control needs direct access to a range mutation. Always create one mutation per completed action and release listeners in `destroy()`.

The complete runnable example, every optional member, registration behavior, mounted controls, and built-in type catalog are in [Inline tools and inline plugins](/guide/inline-extensions).

## Inline plugin contract

An inline plugin persists structured data in text. It must preserve the id passed to `createWidget(data, id)` by placing it in `data-id` on the returned root.

```ts
interface InlinePlugin {
  readonly type: string
  readonly title: string
  readonly icon: string
  createWidget(data: Record<string, string>, id?: string): HTMLElement
  hydrate(element: HTMLElement, context: InlinePluginContext): void
  getData(element: HTMLElement): Record<string, string>
  isCommitted?(element: HTMLElement): boolean
}
```

Optional `trigger`, `pasteConfig`, `onPatternMatch()`, `onEdit()`, `onCancel()`, `onCommit()`, and `insertFresh()` support suggestion flows and pattern conversion. A trigger is exactly one Unicode code point. The editor calls `onCancel()` when an active trigger session is abandoned, so the plugin can close transient UI and cancel pending work. `isCommitted()` can exclude an in-progress widget from structured serialization while preserving its visible text. Interactions that change stored widget data use `context.mutate(target, operation)`.

The editor may instantiate one plugin object for many widget elements. Store element-specific state in a `WeakMap`, not in one shared field.

Widget storage, insertion, renderer registration, and a side-by-side comparison with formatting tools are covered in [Inline tools and inline plugins](/guide/inline-extensions).

## Block renderer contract

A block renderer converts saved data into output DOM:

```js
export function createCalloutRenderer(prefix = 'oe') {
  return {
    type: 'callout',
    styles: [new URL('./callout-renderer.css', import.meta.url).href],
    render(block, parseInline) {
      const root = document.createElement('aside')
      root.className = `${prefix}-callout`
      root.append(parseInline(String(block.data.text ?? '')))
      return root
    },
    mapTextFields(data, transform) {
      data.text = transform(data.text)
    },
  }
}
```

Register it through `renderer.registerRenderer()`. `parseInline()` sanitizes supported formatting and reconstructs registered inline widgets. Never assign untrusted plugin data directly to `innerHTML`.

## Styles and localization

Keep each extension stylesheet scoped under its root class. Declare editor stylesheet URLs through `static styles`; renderer stylesheet URLs use the renderer object's `styles` array. Do not import demo or documentation CSS into the package runtime.

Locale keys for a block should use `plugin.<type>.*`. `createEditor()` passes a dictionary scoped to that prefix into `setI18n()`, so the example resolves `i18n.t('title')` as `plugin.callout.title`. Export locale objects from the extension and merge the selected language into the editor dictionary:

```js
import en from '@shelamkoff/rector/locale/en'
import calloutEn from '@acme/rector-callout/locale/en'

createEditor({
  holder,
  plugins: [new Callout()],
  locale: { ...en, ...calloutEn },
})
```

Supply English and Russian dictionaries when the extension supports both languages. Machine identifiers, configuration keys, and saved values must not vary by language.

## Cleanup and ownership

Release every resource where it is owned. `destroy(element)` may run whenever
one rendered block is replaced, removed, or restored from history. `dispose()`
runs once when the editor releases the plugin instance:

- remove block-local listeners and abort block-local requests in `destroy(element)`;
- remove plugin-wide listeners and caches in `dispose()`;
- disconnect observers and clear timers;
- destroy third-party instances;
- keep object URLs referenced by undo snapshots alive until `dispose()`, then revoke them;
- remove temporary popups through the supplied context;
- ignore asynchronous results after destruction or detachment.

## Publication checklist

Before publishing an extension:

1. document install, import path, configuration, data shape, styles, locale behavior, and cleanup;
2. test empty, valid, malformed, and historical data;
3. test `render → save → render` stability;
4. test one-step undo and redo for every control;
5. test paste routes with hostile HTML, URLs, and oversized files;
6. test multiple blocks and multiple editor instances;
7. provide a matching renderer for a new block type;
8. expose declarations and CSS through the package `exports` map.

Browse the [block plugin catalog](/reference/editor/plugins/index), [inline plugin catalog](/reference/editor/inline-plugins/index), and [renderer catalog](/reference/editor/renderers/index) for concrete contracts.
