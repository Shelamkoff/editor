# Attaches block plugin

One or more downloadable files with selectable presentation variants.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { createAttachesPlugin } from '@shelamkoff/rector/plugins/attaches'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createAttachesPlugin()],
})
```

The registered block type is `attaches`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{
  "files": [
    {
      "id": "file-1",
      "url": "https://cdn.example/a.pdf",
      "name": "a.pdf",
      "size": 1024,
      "extension": "pdf"
    }
  ],
  "variant": "f"
}
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `files` | yes | Non-empty array. Saves always use this plural form. |
| `files[].url` | yes | Canonical URL allowed by the download policy. |
| `files[].name`, `files[].extension` | yes | Strings used for the displayed file name and extension. |
| `files[].size` | yes | Finite non-negative byte count. |
| `variant` | no | Presentation variant `a`, `b`, `f`, or `g`; the plugin default is `f`. |

Legacy input may contain one `file` object instead of `files`; the next save normalizes it to the array contract. Callback URLs must pass the shared download URL policy. Without `uploadFile`, selected files use temporary object URLs; configure an uploader for data that must survive cleanup or page reload.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string; size?: number }>` persists a selected browser file. `actions?: Array<{ icon?; label; handler({ signal }): Promise<Array<{ url; name; size?; extension? }> | null> }>` adds application file sources such as a media library. Both callbacks must respect the supplied abort signal.

## Application file sources

Use `uploadFile` for browser `File` objects and `actions` for existing downloads selected from a file library, cloud drive, or another application-owned catalog. An action may return several files in one selection.

```js
const attaches = createAttachesPlugin({
  actions: [{
    label: 'File library',
    async handler({ signal }) {
      const assets = await openFileLibrary({ multiple: true, signal })
      return assets?.map(asset => ({
        url: asset.downloadUrl,
        name: asset.name,
        size: asset.size,
        extension: asset.extension,
      })) ?? null
    },
  }],
})
```

`url` and `name` are required. `size` and `extension` are optional; the extension is inferred from `name` when omitted. Return `null` when selection is cancelled. The complete selection becomes one undo/redo step. See [File sources and media libraries](https://shelamkoff.github.io/editor/guide/file-sources) for upload, cancellation, validation, and reusable adapter guidance.

## Capabilities

Multiple files; device upload and application sources; editable names; presentation variants; listener/object-URL cleanup; stale results are ignored after disposal.

## Undo, lifecycle, and styles

Each mounted block receives a scoped context. Use `context.updateData(producer)` for data changes, `context.commitDomMutation(operation)` for protected rich-text edits, and `context.beginTask()` for asynchronous results. Each completed action creates one history step. The block instance and its per-editor runtime release their resources through `destroy()`; Rector releases owned styles when their final owner is removed.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/attaches`. The VitePress guide documents configuration, commands and history, extension contracts, the current document format, styling, security, and lifecycle in a sequential form.
