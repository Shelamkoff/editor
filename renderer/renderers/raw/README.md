# Raw renderer

Renderer for the `raw` block. It converts persisted block data into renderer-owned DOM.

The `@shelamkoff/rector/renderer` entry contains the synchronous built-in preset, so `@shelamkoff/carousel` and `@shelamkoff/expose` must be installed before importing it. Passing `blockTypes: []` prevents default renderer construction but does not change ESM module resolution.

## Usage

```js
import { EditorRenderer } from '@shelamkoff/rector/renderer'
import { createRawRenderer } from '@shelamkoff/rector/renderer/renderers/raw'

const renderer = new EditorRenderer({ classPrefix: 'article', blockTypes: [] })
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

The `html` field uses the dedicated raw-HTML sanitizer and a scriptless content document; the inline parser is intentionally not used. The output owns its frame, measurement and permitted-link listeners and releases them in `destroy()`. It declares no automatic stylesheet. Supply application content CSS through `EditorRenderer({ contentStyles: ['body { font: 20px sans-serif; }'] })`; page stylesheets are not inherited automatically. The frame follows content height, while viewport lengths refer to the containing page. Rendering never rewrites the original HTML record.

When styles are declared, the explicit `EditorRenderer.injectStyles()` call shown above acquires them and its returned owner releases them.

The VitePress guide documents renderer ownership, inline widget reconstruction, styles, cleanup, and security boundaries.
