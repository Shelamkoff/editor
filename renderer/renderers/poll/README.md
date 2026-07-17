# Poll renderer

Renderer for the `poll` block. It converts persisted block data into renderer-owned DOM.

The `@shelamkoff/rector/renderer` entry contains the synchronous built-in preset, so `@shelamkoff/carousel` and `@shelamkoff/expose` must be installed before importing it. Passing `blockTypes: []` prevents default renderer construction but does not change ESM module resolution.

## Usage

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createPollRenderer } from '@shelamkoff/rector/renderer/renderers/poll'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createPollRenderer('article', {}, {
  dataSource: {
    load: ({ pollId, signal }) => api.getPollResults(pollId, { signal }),
    vote: ({ pollId, optionIds, revision, signal }) => (
      api.submitPollVote(pollId, { optionIds, revision }, { signal })
    ),
    subscribe({ pollId, signal, onUpdate, onError }) {
      const connection = api.subscribeToPoll(pollId, { onUpdate, onError })
      signal.addEventListener('abort', () => connection.close(), { once: true })
      return () => connection.close()
    },
  },
  onError: error => console.error('Poll renderer data source failed', error),
}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// When the mounted output is removed:
renderer.destroy()
rendererStyles.destroy()
```

## Typical data

```json
{
  "pollId": "release-survey",
  "question": "Which channel should receive the release?",
  "type": "single",
  "options": [{ "id": "stable", "text": "Stable" }, { "id": "next", "text": "Next" }],
  "resultsMode": "afterVote",
  "initialResults": { "total": 0, "options": [{ "id": "stable", "votes": 0 }, { "id": "next", "votes": 0 }] }
}
```

The complete persisted and live-result contract is defined by the matching [Poll plugin](../../../plugins/poll/README.md#field-reference).

## Configuration

The third argument of `createPollRenderer(classPrefix, locale, config)` accepts the same runtime result source as the editor plugin:

| Field | Meaning |
| --- | --- |
| `dataSource` | Optional server adapter. `load` and `vote` are required; `subscribe` is optional. Without it, voting updates renderer-local state initialized from `initialResults`. |
| `onError` | Optional observer for load, vote, subscription, cleanup, or revision-comparator errors. The renderer still displays its localized error state. |
| `maxVoters` | Maximum number of voter records retained from each result. Finite values are rounded down and clamped to zero; omitted or non-finite values use `50`. |
| `compareRevisions` | Optional `(next, current) => number` comparator for opaque server revisions. Return a positive number only when `next` is newer. Without it, unequal revisions follow arrival order. |

`dataSource` is used only when persisted data contains a non-empty `pollId`. `load` obtains the first authoritative snapshot. `vote` receives the complete current selection and the displayed revision and must return another authoritative snapshot. `subscribe` sends later snapshots through `onUpdate`; report connection errors through its `onError` callback and return an idempotent cleanup function. Every callback receives an `AbortSignal`; stop outstanding work when it is aborted. Every result must contain `total` (the ballot-count percentage denominator) and one `{ id, votes }` entry for every current option. Multiple-choice option counts may sum above `total`.

Question and option text use the inline parser; voter avatars use the media URL policy. Live results are runtime state and do not change the document passed to `renderTo()`. The renderer owns vote state, cancellation, subscriptions, and controls and releases them in `destroy()`. It declares one stylesheet.

When styles are declared, the explicit `EditorRenderer.injectStyles()` call shown above acquires them and its returned owner releases them.

The VitePress guide documents renderer ownership, inline widget reconstruction, styles, cleanup, and security boundaries.
