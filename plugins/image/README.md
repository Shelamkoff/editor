# Image block plugin

Uploadable image with caption, sizing, border, background, and object-fit controls.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Image } from '@shelamkoff/rector/plugins/image'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Image()],
})
```

The registered block type is `image`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{
  "file": { "url": "https://cdn.example/image.jpg" },
  "caption": "Caption",
  "withBorder": false,
  "expanded": false,
  "withBackground": false,
  "styles": { "objectFit": "cover", "borderRadius": "8px" }
}
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `file.url` | yes | Canonical media URL accepted by Rector's media policy. An empty URL exists only in an unsaved empty block. |
| `file.width`, `file.height` | no | Positive finite intrinsic dimensions in pixels. |
| `caption` | no | Caption as sanitized inline HTML; defaults to an empty string. |
| `withBorder` | no | Enables the built-in border presentation; defaults to `false`. |
| `expanded` | no | Expands the image to the editor content width and ignores custom width constraints while active; defaults to `false`. |
| `withBackground` | no | Applies `styles.backgroundColor` to the image container; defaults to `false`. |
| `styles` | no | String-valued style map. The settings UI writes `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `objectFit`, `objectPosition`, `backgroundColor`, `borderStyle`, `borderColor`, `borderWidth`, and `borderRadius`. CSS values should be constrained by the host when data is untrusted. |

Without `uploadFile`, local files are stored as data URLs. Validate file size/type in application code before remote upload. Callback results are accepted only when `url` passes the shared media URL policy.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string; alt?: string }>` uploads a file. `actions?: Array<{ icon?; label; handler(context: { signal: AbortSignal }): Promise<{ url: string; alt?: string } | null> }>` adds application media sources. Both callbacks must stop work when the supplied signal is aborted.

## Application file sources

Use `uploadFile` when the user selects a browser `File`. Use `actions` to add application-owned choices such as a media library, cloud drive, or stock catalog. Each action is shown both before an image is selected and in the controls of a populated block.

`openMediaLibrary` in this example belongs to the consuming application; Rector does not prescribe its UI or transport:

```js
const image = new Image({
  actions: [{
    label: 'Media library',
    async handler({ signal }) {
      const asset = await openMediaLibrary({
        accept: ['image/*'],
        multiple: false,
        signal,
      })
      return asset ? { url: asset.url, alt: asset.alt } : null
    },
  }],
})
```

Return `null` when selection is cancelled. A valid result replaces the image in one undo/redo step; `alt` initializes an empty caption. Multiple independent sources may be added as separate `actions` entries. See [File sources and media libraries](https://shelamkoff.github.io/editor/guide/file-sources) for upload, cancellation, validation, and reusable adapter guidance.

## Capabilities

Image-file and URL paste; async paste transaction; settings; custom media actions; deterministic cleanup.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/image`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
