# Embed renderer

Renderer for the `embed` block. It converts persisted block data into renderer-owned DOM.

The `@shelamkoff/rector/renderer` entry contains the synchronous built-in preset, so `@shelamkoff/carousel` and `@shelamkoff/expose` must be installed before importing it. Passing `blockTypes: []` prevents default renderer construction but does not change ESM module resolution.

## Usage

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createEmbedRenderer } from '@shelamkoff/rector/renderer/renderers/embed'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createEmbedRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// When the mounted output is removed:
renderer.destroy()
rendererStyles.destroy()
```

## Typical data

```json
{ "service": "youtube", "videoId": "dQw4w9WgXcQ", "caption": "Caption", "cover": "", "title": "", "duration": "" }
```

The shared player builds output only for supported providers and the caption uses the inline parser. The play listener is released with the rendered root. The renderer declares one stylesheet.

When styles are declared, the explicit `EditorRenderer.injectStyles()` call shown above acquires them and its returned owner releases them.

The VitePress guide documents renderer ownership, inline widget reconstruction, styles, cleanup, and security boundaries.
