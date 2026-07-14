# Mention inline plugin

Trigger-driven mention search with keyboard navigation, cursor pagination, custom rendering, and stable saved widget identities.

## Register in the editor

```js
import { createEditor } from '@shelamkoff/rector'
import { Paragraph } from '@shelamkoff/rector/plugins/paragraph'
import { createMentionPlugin } from '@shelamkoff/rector/inline-plugins/mention'
import '@shelamkoff/rector/styles/editor.css'

const mention = createMentionPlugin({
  async searchFunction(query, nextPageUrl, { signal }) {
    const response = await fetch(nextPageUrl ?? `/api/people?q=${encodeURIComponent(query)}`, { signal })
    return response.json() // { items, nextPageUrl?: string | null } or MentionItem[]
  },
})

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Paragraph()],
  inlinePlugins: [mention],
})
```

## Options

- `trigger?: string` defaults to `@`;
- `searchFunction(query, nextPageUrl, { signal })` returns an item array or `{ items, nextPageUrl? }`; the second argument is `null` for the first page and the signal is aborted when the request becomes obsolete;
- `debounceDelay?: number`, `noResultsText?: string`, and `dropdownClass?: string` customize behavior and presentation;
- `onMentionSelect?: ({ id, name }) => void` observes committed mentions;
- `renderItem`, `renderNoResults`, and `renderLoading` may return custom elements or return nothing to use the fallback UI.

Each item requires `id: string | number` and `name: string`. Optional `avatar`, `details`, and extra application fields remain available to `renderItem`; they are not persisted and are not passed to `onMentionSelect`. Saved widget data and the selection callback contain only `{ id, name }` (the saved id is normalized to a string).

For document output, pass `createMentionWidget()` through `RendererConfig.inlinePlugins`. Pending searches use both stale-result suppression and `AbortSignal` cancellation. The signal is aborted by a newer query, popup closure, or `editor.destroy()`; the supplied callback must pass it to its network client. All popup listeners, timers, and plugin state are released by `editor.destroy()`.

The VitePress extension guide documents the complete inline widget contract, history boundary, storage shape, and cleanup rules.
