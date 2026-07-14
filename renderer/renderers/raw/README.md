# Raw renderer

Renderer for the `raw` block. It converts persisted block data into renderer-owned DOM.

The `@shelamkoff/rector/renderer` entry contains the synchronous built-in preset, so `@shelamkoff/carousel` and `@shelamkoff/expose` must be installed before importing it. Passing `blockTypes: []` prevents default renderer construction but does not change ESM module resolution.

## Usage

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createRawRenderer } from '@shelamkoff/rector/renderer/renderers/raw'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createRawRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// When the mounted output is removed:
renderer.destroy()
rendererStyles.destroy()
```

## Typical data

```json
{ "html": "<section>Content</section>" }
```

The `html` field uses the dedicated raw-HTML sanitizer; the inline parser is intentionally not used. The renderer creates no listeners or external instances and declares no stylesheet.

When styles are declared, the explicit `EditorRenderer.injectStyles()` call shown above acquires them and its returned owner releases them.

The VitePress guide documents renderer ownership, inline widget reconstruction, styles, cleanup, and security boundaries.
