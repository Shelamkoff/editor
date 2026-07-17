# Mention inline plugin

Trigger-driven entity search with keyboard navigation, cursor pagination, custom result rendering, and stable saved widget identities.

## Register in the editor

```js
import { createEditor } from '@shelamkoff/rector'
import { Paragraph } from '@shelamkoff/rector/plugins/paragraph'
import { createMentionPlugin } from '@shelamkoff/rector/inline-plugins/mention'
import '@shelamkoff/rector/styles/editor.css'

const mention = createMentionPlugin({
  async searchFunction(query, nextPageUrl, { signal }) {
    const url = nextPageUrl ?? `/api/people?q=${encodeURIComponent(query)}`
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Mention search failed: ${response.status}`)
    return response.json()
  },
})

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Paragraph()],
  inlinePlugins: [mention],
})
```

The plugin type is `mention`. The trigger must be exactly one Unicode code point. Typing it at the beginning of a text node or after a regular or non-breaking space opens search. `query` excludes the trigger. Arrow keys move the active result, Enter or Tab commits it, Escape closes the popup, and scrolling near the end requests `nextPageUrl` when supplied.

## Search contract

`searchFunction` returns either `MentionItem[]` or `{ items: MentionItem[], nextPageUrl?: string | null }`:

```ts
interface MentionItem {
  id: string | number
  name: string
  avatar?: string
  details?: string
  [applicationField: string]: unknown
}
```

For the first page, `nextPageUrl` passed to the callback is `null`. For later pages it is the opaque cursor previously returned by the application. Pass the supplied `AbortSignal` to the network or data client. A newer query, popup closure, or `editor.destroy()` aborts the current signal and stale responses are ignored even if the underlying client cannot cancel.

An omitted `searchFunction` is valid but yields no suggestions. Errors other than cancellation are written to `console.warn` and leave the current session without replacement results.

## Options

| Option | Type | Default and behavior |
| --- | --- | --- |
| `trigger` | `string` | `@`. Exactly one Unicode code point that starts and visually prefixes a mention; any other value throws during plugin creation. Multi-code-point grapheme clusters such as a flag are therefore rejected. |
| `searchFunction` | `MentionSearchFunction \| null` | `null`; no results until the host supplies a source. |
| `debounceDelay` | `number` | `300` ms for non-empty first-page queries. Empty and subsequent-page queries run immediately. |
| `noResultsText` | `string` | Current locale message (`No results found` in English). |
| `dropdownClass` | `string` | Empty string. Extra class on the popup root. |
| `onMentionSelect` | `({ id, name }) => void` | No callback. Observes a committed selection; callback exceptions do not roll back the commit. |
| `renderItem` | `(item, index, isActive) => HTMLElement \| null` | Built-in item with optional avatar and details. Return `null` or `undefined` to use it. |
| `renderNoResults` | `(text) => HTMLElement \| null` | Built-in empty-result row. |
| `renderLoading` | `() => HTMLElement \| null` | Built-in loading row. |

Extra item fields are available only to `renderItem`. They are not persisted and are not passed to `onMentionSelect`.

Each renderer must return a fresh, detached `HTMLElement` for that call. Rector adds the listbox classes, indices, ids, and ARIA attributes required for keyboard navigation to custom result rows. It also marks custom empty and loading rows as live status content. Returning `null`, `undefined`, or a non-element value selects the built-in row.

## Stored data and editing

The text field stores `{{widgetId}}`, while the block-level `inline` map stores only the stable entity identity and display name:

```json
{
  "text": "Owner: {{w_owner}}",
  "inline": {
    "w_owner": {
      "type": "mention",
      "data": { "id": "42", "name": "Ada Lovelace" }
    }
  }
}
```

The saved `id` is normalized to a string. `onMentionSelect` receives the source item's original string or number id. Editing an existing pill starts a new query. Choosing a result updates the widget atomically; leaving without a choice converts the edited pill to ordinary visible text. If autosave occurs while that query is still in progress, the transient pill is likewise serialized as text rather than as an invalid mention.

## History, lifecycle, and styles

A fresh commit or replacement of an existing mention is one undo/redo step. Search text, active-row movement, loading state, and opening or closing the popup are transient UI state and do not create commands.

The plugin owns one popup, its document/window listeners, debounce timer, request controller, and a reference-counted stylesheet handle. `editor.destroy()` releases all of them. Register one separately created mention plugin per editor; mounting the same instance twice is rejected.

Use `.oe-ip--mention` for saved pills and `.oe-mention-dropdown` plus its child classes for the suggestion UI. `avatar` URLs pass the shared media URL policy, and built-in rows assign names/details through text-safe DOM operations.

## Document output

Pass `createMentionWidget()` in `EditorRenderer`'s `inlinePlugins` array. It contains only the widget DOM round-trip and does not include search, popup code, or editor listeners. If the editor uses a non-default trigger, pass that same character to the renderer factory, for example `createMentionWidget('#')`. The trigger is presentation configuration and is not repeated in every saved widget.

The sequential VitePress guide documents the complete inline-widget contract, storage format, history boundaries, custom plugin creation, security, and cleanup.
