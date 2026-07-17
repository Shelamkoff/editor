# Inline tools and inline plugins

Rector has two extension mechanisms that appear inside text but solve different problems. An inline tool changes formatting already stored in a block's HTML-bearing field. An inline plugin inserts a persistent structured widget with its own serialized data.

## Choose the correct mechanism

| Requirement | Inline tool | Inline plugin |
| --- | --- | --- |
| Bold, underline, link, font size, alignment | yes | no |
| A mention, product token, formula, or entity reference | no | yes |
| Own record in the document | no | yes, in `block.inline` |
| Acts on a text selection | normally | not required |
| Can open a suggestion popup | possible, but uncommon | yes |
| Reconstructed by a renderer widget factory | no | yes |

Formatting produced by a tool becomes part of the block plugin's normal text data, for example `{ text: 'Hello <strong>world</strong>' }`. A widget is stored as a `{{widgetId}}` token in that text and a matching entry in the block-level `inline` map.

For interactive extensions, call the supplied mutation boundary once for each completed user action. Two separate clicks are two actions and therefore create two commands; one click that changes several related values is still one action.

## Configure inline tools

When `inlineTools` is omitted, Rector creates all built-in tools. An empty array disables the common tool set. String entries select built-in tools, while object entries register custom implementations. Array order is toolbar order.

```js
createEditor({
  holder,
  plugins,
  inlineTools: ['bold', 'italic', 'link'],
})
```

The built-in names are case-sensitive:

| `type` | Behavior |
| --- | --- |
| `bold` | bold text |
| `italic` | italic text |
| `strikethrough` | struck-through text |
| `link` | create or remove a sanitized link |
| `code` | inline code |
| `marker` | highlighted text using `mark` |
| `bgcolor` | background color |
| `fontSize` | integer font size from 1 to 200 pixels; presets are 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, and 64 pixels; 16 pixels removes an explicit size |
| `script` | superscript or subscript |
| `align` | alignment of affected blocks |
| `caseTransform` | toggle selected cased Unicode letters between uppercase and lowercase; digits, punctuation, and uncased scripts are unchanged |
| `clearFormatting` | remove `b`, `i`, `s`, `code`, `mark`, `span`, `em`, `strong`, `u`, `sup`, and `sub` formatting while preserving links, inline widgets, and block alignment |

`align` is grouped with inline tools because it is exposed from the selection
toolbar, but it does not wrap the selected text in markup. It changes the whole
affected block and persists the value as `block.tunes.textAlign`. For Paragraph
and Heading, the plugin-owned `data.align` field remains supported; the tune is
the cross-plugin override when both values exist.

An unknown string causes `createEditor()` to throw. If the array contains the same `type` more than once, the later object replaces the earlier implementation while retaining its first toolbar position. This permits `['bold', customBold]`; use duplicate types only for an intentional replacement.

## Create a tag-based tool

Use the supplied factory when a tool only toggles one HTML tag. This keeps partial selections, nested formatting, selection restoration, and cleanup consistent with the built-in tools.

```js
import { createEditor } from '@shelamkoff/rector'
import { createSimpleInlineTool } from '@shelamkoff/rector/inline-tools/utils'

const underline = createSimpleInlineTool(
  'underline',
  'Underline',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><path d="M4 21h16"/></svg>',
  'u',
  'Mod+U',
)

const editor = createEditor({
  holder,
  plugins,
  inlineTools: ['bold', 'italic', underline],
})
```

The icon string is assigned to trusted editor UI through `innerHTML`. Keep it as package-owned static SVG; never build it from document or user input.

## Full inline tool contract

Use the object contract for behavior that cannot be represented by one tag.

```ts
interface InlineTool {
  readonly type: string
  readonly title?: string
  readonly icon: string
  readonly shortcut?: string
  readonly tag?: string

  isActive(selection: InlineSelection): boolean
  toggle(selection: InlineSelection): void
  renderActions?(ctx: InlineToolActionContext): HTMLElement | null
  getIcon?(active: boolean): string
  getTitle?(active: boolean): string
  onMount?(button: HTMLElement, mutations?: InlineMutationContext): void
  isDropdownOpen?(): boolean
  destroy?(): void
}

interface InlineSelection {
  blockId: string
  range: Range
  text: string
}
```

Rector calls `isActive()` when the selection changes. It must inspect state without changing the document. A normal toolbar click wraps `toggle()` in one range command automatically, so `toggle()` changes the supplied range directly and must not start another command.

`getIcon()` and `getTitle()` may reflect the current active state. `tag` describes the principal HTML tag and is metadata for compatible tools. A shortcut uses normalized names such as `Mod+U`; `Mod` means Command on macOS and Control on Windows or Linux.

### Tool with an actions panel

Implement `renderActions()` when the user must enter or choose a value. Rector preserves the original range while focus is inside the panel.

```js
const textColor = {
  type: 'textColor',
  title: 'Text color',
  icon: '<svg viewBox="0 0 24 24" aria-hidden="true">...</svg>',

  isActive({ range }) {
    return Boolean(range.startContainer.parentElement?.closest('[data-text-color]'))
  },

  toggle() {},

  renderActions(ctx) {
    const input = document.createElement('input')
    input.type = 'color'

    input.addEventListener('change', () => {
      ctx.restoreSelection()
      ctx.mutate(() => applyColor(ctx.range, input.value))
      ctx.close()
    })

    return input
  },
}
```

Each completed choice calls `ctx.mutate()` once. Opening the panel, changing focus, or previewing a value must not create a history entry. Returning `null` from `renderActions()` tells Rector to fall back to `toggle()` for that activation.

`InlineToolActionContext` also exposes `range`, `restoreSelection()`, `close()`, `showTooltip(anchor, label)`, and `hideTooltip()`. `range` is the cloned range that was active when the panel opened. Call `restoreSelection()` immediately before applying a DOM change, then wrap the completed change in one `mutate()` call. `close()` returns from the actions panel to the tool buttons. `showTooltip()` and `hideTooltip()` reuse Rector's accessible tooltip for controls inside the panel; they do not alter selection or history.

### Mounted controls and cleanup

`onMount(button, mutations)` is intended for a tool that adds a dropdown or other long-lived DOM next to its button. A later dropdown action is outside the normal button-click wrapper, so it must call `mutations.mutate(range, operation)` once with the saved range. Return `true` from `isDropdownOpen()` while the overlay is active so Rector does not hide the toolbar.

Use `destroy()` to remove document or window listeners, detached popups, observers, timers, and other resources created by the tool. One tool object belongs to one editor instance and must not be reused after `editor.destroy()`.

## Enable tools for a block type

A block plugin decides whether its editable content participates in the inline toolbar:

```js
class CodeBlock {
  inlineTools = false
}

class Paragraph {
  inlineTools = true
}

class Title {
  inlineTools = ['bold', 'italic']
}
```

Use `false` for blocks that do not expose compatible editable text. `true` or an omitted value enables the editor's configured tool set. A string array is a per-block allowlist: only tools that are both configured in the editor and named by the block are shown. An empty array disables the toolbar for that block.

For a selection spanning multiple blocks, Rector shows only the intersection of their allowlists. If any selected block disables inline tools, the toolbar is hidden. Tool names that were not registered in the editor never create a button.

## Configure inline plugins

Register persistent widget plugins separately from formatting tools:

```js
import { createMentionPlugin } from '@shelamkoff/rector/inline-plugins/mention'

const editor = createEditor({
  holder,
  plugins,
  inlinePlugins: [
    createMentionPlugin({
      searchFunction: query => searchPeople(query),
    }),
  ],
})
```

The editor plugin and the renderer widget factory must use the same `type` and data shape. Register every inline plugin referenced by a loaded document; otherwise its token remains content that cannot be reconstructed as a widget.

## Inline plugin contract

```ts
interface InlinePlugin {
  readonly type: string
  readonly title: string
  readonly icon: string
  readonly trigger?: string
  readonly pasteConfig?: { patterns: RegExp[] }

  createWidget(data: Record<string, string>, id?: string): HTMLElement
  mount?(rootElement: HTMLElement, ctx: InlinePluginContext): void
  hydrate(element: HTMLElement, ctx: InlinePluginContext): void
  getData(element: HTMLElement): Record<string, string>
  isCommitted?(element: HTMLElement): boolean
  onPatternMatch?(match: string): Record<string, string>
  onEdit?(element: HTMLElement, text: string, ctx: InlinePluginContext): void
  onCancel?(): void
  onCommit?(element: HTMLElement, data: Record<string, string>): void
  insertFresh?(ctx: InlinePluginContext): void
  destroy?(): void
}
```

`createWidget()` builds the widget and must preserve a supplied id as `data-id`. `mount()` acquires editor-scoped resources after the owning root and mutation context exist. `getData()` returns JSON-compatible strings for serialization. `hydrate()` attaches behavior to restored DOM. A `trigger` must be exactly one Unicode code point. `onEdit()` receives the text between that trigger and the caret; `onCancel()` closes plugin-owned transient UI when the caret leaves the session, Escape is pressed, the trigger is removed, or the editor is destroyed. Optional paste-pattern members support automatic conversion; `insertFresh()` replaces the default programmatic insertion behavior. `destroy()` releases mounted resources and widget state when the editor is destroyed.

Implement `isCommitted(element)` when a widget has a temporary state that is visible while the user is searching or editing but is not yet valid document data. Return `false` only for that temporary state. During `save()`, Rector serializes the element's visible text as ordinary text and omits its `block.inline` entry. A committed widget must return `true` (or omit the method). This prevents autosave from producing an incomplete entity while keeping the user's typed query.

One plugin object can hydrate many widget elements. Store element-specific state in a `WeakMap`. Use `ctx.showPopup()` and `ctx.hidePopup()` for owned overlays, and use `ctx.mutate(target, operation)` once per completed persistent change. The target must be the widget or one of its descendants so Rector can find the owner block.

`InlinePluginContext.readOnly` reports the current interaction mode. Do not mount or activate mutating controls when it is `true`. `ctx.notifyChanged(target?)` tells Rector that plugin state changed outside `ctx.mutate()` so change observers can resave it; it does not create a history snapshot and is not a replacement for `ctx.mutate()`. Prefer `ctx.mutate()` for every user action that changes persistent data. Use `notifyChanged()` only after an already committed external update or a plugin flow whose command boundary is owned elsewhere, and pass an element inside the owning block whenever possible.

## Insert a widget from application code

```js
const inserted = editor.insertInlinePlugin('mention', {
  id: 'user-42',
  name: 'Ada Lovelace',
})
```

The method returns `false` when the plugin is not registered or the caret is not inside a compatible text block. A plugin with `insertFresh()` may start its own interactive insertion flow instead of immediately creating a widget.

## Rendering and security

Formatting HTML is sanitized by Rector's inline parser. A widget is reconstructed only by a registered renderer factory; serialized data is not executed as markup. Treat plugin data, pasted strings, URLs, search results, and files as untrusted input. Escape text, sanitize URLs, and keep trusted icon SVG separate from document data.

Read [Commands and history](/guide/commands-history) before implementing interactive controls, [Document format](/guide/document-format) for widget storage, and [Rendering documents](/guide/rendering) for output registration.
