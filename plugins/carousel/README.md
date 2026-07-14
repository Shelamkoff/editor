# CarouselBlock block plugin

Mixed image, video, and sanitized HTML slides with navigation, pagination, thumbnails, autoplay, and ordering controls.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { CarouselBlock } from '@shelamkoff/rector/plugins/carousel'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new CarouselBlock()],
})
```

The registered block type is `carousel`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{
  "slides": [
    { "id": "cover", "type": "image", "src": "https://cdn.example/cover.jpg", "alt": "Cover", "caption": "Opening slide" },
    { "id": "clip", "type": "video", "src": "https://cdn.example/clip.mp4", "poster": "https://cdn.example/poster.jpg", "caption": "Video" },
    { "id": "note", "type": "html", "html": "<strong>Sanitized HTML</strong>" }
  ],
  "options": { "loop": true, "autoplay": false, "autoplayDelay": 5000, "navigation": true, "pagination": true, "thumbnails": false, "aspectRatio": "16 / 9" }
}
```

Every slide requires a stable `id` and a `type` of `image`, `video`, or `html`. Media sources pass the shared URL policy; HTML is sanitized. Without `uploadFile`, images become data URLs and videos use temporary object URLs, so persistent video documents require an uploader. The document renderer requires `@shelamkoff/carousel`.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string; poster?: string }>` persists image or video files. `actions?: Array<{ icon?; label; handler({ signal }): Promise<CarouselSlide[] | null> }>` adds application-provided slide sources. Both callbacks must respect the supplied abort signal.

## Application file sources

Use `uploadFile` for image or video `File` objects and `actions` for existing slides selected from a media library, cloud drive, or another application-owned catalog. One action may return mixed image, video, and HTML slides.

```js
const carousel = new CarouselBlock({
  actions: [{
    label: 'Media library',
    async handler({ signal }) {
      const assets = await openMediaLibrary({
        accept: ['image/*', 'video/*', 'text/html'],
        multiple: true,
        signal,
      })
      return assets?.map(asset => asset.type === 'html'
        ? {
            id: asset.id,
            type: 'html',
            html: asset.html,
            caption: asset.caption,
          }
        : {
            id: asset.id,
            type: asset.type,
            src: asset.url,
            alt: asset.alt,
            poster: asset.poster,
            caption: asset.caption,
          }) ?? null
    },
  }],
})
```

Every returned slide needs a stable, unique `id`. Media items use `type: 'image' | 'video'` and `src`; HTML items use `type: 'html'` and `html`. Return `null` when selection is cancelled. The complete selection becomes one undo/redo step. See [File sources and media libraries](https://shelamkoff.github.io/editor/guide/file-sources) for upload, cancellation, validation, and reusable adapter guidance.

## Capabilities

Image/video upload; URL and sanitized-HTML slides; add/remove/reorder; loop, autoplay, navigation, pagination, thumbnail, delay, and aspect-ratio controls; cancellable application actions and uploads.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/carousel`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
