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

The [attaches plugin field reference](../../../plugins/attaches/README.md#field-reference) is the canonical persisted-data contract shared by the editor and renderer.

Links use the download URL policy. Archive work, cancellation, object URLs, and interactive controls belong to the block and are released by `destroy()`. The renderer declares one stylesheet.

## Archive helpers

The renderer subpath also exports the same archive primitives used by its “download all” control:

- `ARCHIVE_LIMITS` is an immutable object with `files` (50), `fileBytes` (25 MiB), `totalBytes` (100 MiB), and `concurrency` (4). These are hard limits, not configuration options.
- `sanitizeArchiveFilename(value, index?)` returns a flat portable ZIP-entry name. It removes path separators and control characters, avoids Windows reserved names, trims unsafe trailing characters, limits the result to 128 characters, and falls back to `file-${index + 1}`.
- `downloadArchive(files, { signal })` fetches safe download URLs, skips individual network failures, creates `files.zip`, starts a browser download, and resolves with no value. It rejects when cancelled, when a hard size/count limit is exceeded, or when no file can be archived. Pass an `AbortSignal`; the function requires browser `document`, `fetch`, `Blob`, and object-URL APIs.

Files with rejected URL schemes are omitted. Filenames are made unique inside an archive. The helper does not return the generated `Blob` and does not upload or persist anything.

When styles are declared, the explicit `EditorRenderer.injectStyles()` call shown above acquires them and its returned owner releases them.

The VitePress guide documents renderer ownership, inline widget reconstruction, styles, cleanup, and security boundaries.
