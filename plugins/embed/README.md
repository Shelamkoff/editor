# Embed block plugin

YouTube and Vimeo embed block with caption, cover image, and preview metadata.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Embed } from '@shelamkoff/rector/plugins/embed'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Embed()],
})
```

The registered block type is `embed`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{ "service": "youtube", "videoId": "dQw4w9WgXcQ", "caption": "Caption", "cover": "", "title": "", "duration": "" }
```

Upload, action, and preview callbacks receive an `AbortSignal` and must stop work when it is aborted. The preview request is `{ service: "vimeo", videoId, url, signal }`. Only supported provider URLs and media URLs accepted by the shared policy are used.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string }>` uploads a cover. `actions?: Array<{ icon?; label; handler(context: { signal: AbortSignal }): Promise<{ url: string } | null> }>` adds application cover sources. `resolvePreview?: false | (request) => Promise<{ thumbnailUrl: string; title?: string } | null>` overrides Vimeo preview resolution; `false` disables it. `previewTimeoutMs?: number` defaults to 5000 ms.

## Application cover sources

`uploadFile` and `actions` apply to the video cover only; the video itself is selected with a supported YouTube or Vimeo URL. Use an action to add a media library, cloud drive, or another application-owned image source.

```js
const embed = new Embed({
  actions: [{
    label: 'Media library',
    async handler({ signal }) {
      const asset = await openMediaLibrary({
        accept: ['image/*'],
        multiple: false,
        signal,
      })
      return asset ? { url: asset.url } : null
    },
  }],
})
```

Return `null` when selection is cancelled. A valid result replaces the cover in one undo/redo step. Multiple independent cover sources may be added as separate `actions` entries. See [File sources and media libraries](https://shelamkoff.github.io/editor/guide/file-sources) for upload, cancellation, validation, and reusable adapter guidance.

## Capabilities

YouTube/Vimeo URL paste; cover upload; cancellable preview resolution; settings and cleanup.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/embed`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
