# Quote renderer

Renderer for the `quote` block. It converts persisted block data into renderer-owned DOM.

The `@shelamkoff/rector/renderer` entry contains the synchronous built-in preset, so `@shelamkoff/carousel` and `@shelamkoff/expose` must be installed before importing it. Passing `blockTypes: []` prevents default renderer construction but does not change ESM module resolution.

## Usage

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createQuoteRenderer } from '@shelamkoff/rector/renderer/renderers/quote'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createQuoteRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// When the mounted output is removed:
renderer.destroy()
rendererStyles.destroy()
```

## Typical data

```json
{ "text": "Quote", "caption": "Author" }
```

The `text` and `caption` fields use the shared inline parser. The renderer declares one stylesheet and creates no listeners or external instances.

When styles are declared, the explicit `EditorRenderer.injectStyles()` call shown above acquires them and its returned owner releases them.

The VitePress guide documents renderer ownership, inline widget reconstruction, styles, cleanup, and security boundaries.
