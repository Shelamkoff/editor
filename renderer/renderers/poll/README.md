# Poll renderer

Renderer for the `poll` block. It converts persisted block data into renderer-owned DOM.

The `@shelamkoff/rector/renderer` entry contains the synchronous built-in preset, so `@shelamkoff/carousel` and `@shelamkoff/expose` must be installed before importing it. Passing `blockTypes: []` prevents default renderer construction but does not change ESM module resolution.

## Usage

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createPollRenderer } from '@shelamkoff/rector/renderer/renderers/poll'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createPollRenderer('article', {}))
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

Question and option text use the inline parser; voter avatars use the media URL policy. The renderer owns vote state, cancellation, subscriptions, and controls and releases them in `destroy()`. It declares one stylesheet.

When styles are declared, the explicit `EditorRenderer.injectStyles()` call shown above acquires them and its returned owner releases them.

The VitePress guide documents renderer ownership, inline widget reconstruction, styles, cleanup, and security boundaries.
