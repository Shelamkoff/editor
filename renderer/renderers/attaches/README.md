# Attaches renderer

Renderer for the `attaches` block. It converts persisted block data into renderer-owned DOM.

The `@shelamkoff/rector/renderer` entry contains the synchronous built-in preset, so `@shelamkoff/carousel` and `@shelamkoff/expose` must be installed before importing it. Passing `blockTypes: []` prevents default renderer construction but does not change ESM module resolution.

## Usage

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createAttachesRenderer } from '@shelamkoff/rector/renderer/renderers/attaches'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createAttachesRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// When the mounted output is removed:
renderer.destroy()
rendererStyles.destroy()
```

## Typical data

```json
{
  "files": [{ "url": "https://cdn.example/a.pdf", "name": "a.pdf", "size": 1024, "extension": "pdf" }],
  "variant": "f"
}
```

Links use the download URL policy. Archive work, cancellation, object URLs, and interactive controls belong to the block and are released by `destroy()`. The renderer declares one stylesheet.

When styles are declared, the explicit `EditorRenderer.injectStyles()` call shown above acquires them and its returned owner releases them.

The VitePress guide documents renderer ownership, inline widget reconstruction, styles, cleanup, and security boundaries.
