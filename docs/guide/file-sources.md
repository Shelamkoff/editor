# File sources and media libraries

Rector does not assume a backend, storage provider, or media-library UI. A file-capable plugin delegates persistence and application-owned selection to callbacks supplied when the plugin is created.

## Two separate integration points

`uploadFile` handles a browser `File` selected from the device or received by paste/drop. It must persist the file and return the public URL that belongs in the document.

`actions` adds application-owned sources such as a media library, cloud drive, stock catalog, or DAM. Each action opens the consumer's UI and returns already selected, serializable items. `Image`, `Gallery`, `CarouselBlock`, and `Attaches` expose configured actions both before the first item is selected and in the controls of a populated block. `Embed` exposes them in the cover controls after a supported video URL has been entered.

| Plugin | `uploadFile` result | One `actions[].handler` result |
| --- | --- | --- |
| `Image` | `{ url, alt? }` | `{ url, alt? } \| null` |
| `Gallery` | `{ url, alt? }` for each file | `Array<{ url, alt? }> \| null` |
| `CarouselBlock` | `{ url, poster? }` for each image/video file | `CarouselSlide[] \| null` |
| `Embed` | `{ url }` for a replacement cover | `{ url } \| null` |
| `Attaches` | `{ url, size? }` for each file | `Array<{ url, name, size?, extension? }> \| null` |

`Person` owns a separate avatar-and-crop workflow and is intentionally not part of this shared source contract.

## Media-library adapter

The following adapter is application code. `openMediaLibrary()` may show any modal, query any API, and return the user's selection. Rector only owns the callback contract and the resulting document mutation.

```js
import { Image } from '@shelamkoff/rector/plugins/image'
import { Gallery } from '@shelamkoff/rector/plugins/gallery'
import { CarouselBlock } from '@shelamkoff/rector/plugins/carousel'

const mediaLibraryAction = {
  label: 'Media library',
  async handler({ signal }) {
    const selection = await openMediaLibrary({
      accept: ['image/*', 'video/*'],
      multiple: true,
      signal,
    })
    if (!selection || signal.aborted) return null
    return selection
  },
}

const image = new Image({
  actions: [{
    ...mediaLibraryAction,
    async handler(context) {
      const items = await mediaLibraryAction.handler(context)
      const item = items?.find(candidate => candidate.type === 'image')
      return item ? { url: item.url, alt: item.alt } : null
    },
  }],
})

const gallery = new Gallery({
  actions: [{
    ...mediaLibraryAction,
    async handler(context) {
      const items = await mediaLibraryAction.handler(context)
      return items?.filter(item => item.type === 'image')
        .map(item => ({ url: item.url, alt: item.alt })) ?? null
    },
  }],
})

const carousel = new CarouselBlock({
  actions: [{
    ...mediaLibraryAction,
    async handler(context) {
      const items = await mediaLibraryAction.handler(context)
      return items?.map(item => item.type === 'html'
        ? {
            id: item.id,
            type: 'html',
            html: item.html,
            caption: item.caption,
          }
        : {
            id: item.id,
            type: item.type,
            src: item.url,
            alt: item.alt,
            poster: item.poster,
            caption: item.caption,
          }) ?? null
    },
  }],
})
```

An action icon is optional. When supplied, pass markup from the same trusted icon library used by the host UI; do not put user-authored HTML in `icon`.

## Uploading device files

```js
const image = new Image({
  async uploadFile(file, { signal }) {
    const body = new FormData()
    body.append('file', file)

    const response = await fetch('/api/media', {
      method: 'POST',
      body,
      signal,
    })
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`)

    const asset = await response.json()
    return { url: asset.url, alt: asset.alt }
  },
})
```

Without `uploadFile`, `Image` and `Gallery` use data URLs, while `CarouselBlock` uses data URLs for images and temporary object URLs for videos. `Attaches` uses temporary object URLs. Object URLs are revoked during cleanup and never form a persistent document; configure `uploadFile` for content that must survive reload.

## Plugin-specific source examples

### Carousel

```js
new CarouselBlock({
  uploadFile: persistCarouselFile,
  actions: [{
    label: 'Media library',
    async handler({ signal }) {
      return await chooseCarouselSlides({ signal })
      // image: { id, type: 'image', src, alt?, caption? }
      // video: { id, type: 'video', src, poster?, caption? }
      // HTML:  { id, type: 'html', html, caption? }
    },
  }],
})
```

Each carousel slide requires a stable, unique `id`. Rector sanitizes media URLs and HTML before storing them. An action may return multiple mixed slide types; one completed selection is committed as one undo step.

### Attachments

```js
import { Attaches } from '@shelamkoff/rector/plugins/attaches'

new Attaches({
  uploadFile: persistDownload,
  actions: [{
    label: 'File library',
    async handler({ signal }) {
      const files = await chooseDownloads({ signal })
      return files?.map(file => ({
        url: file.downloadUrl,
        name: file.name,
        size: file.size,
        extension: file.extension,
      })) ?? null
    },
  }],
})
```

`name` is required for application-selected attachments. `size` and `extension` are optional; the extension is inferred from `name` when omitted.

### Embed cover

`Embed` uses `uploadFile` and `actions` only for the video cover. The video itself is selected by a supported YouTube or Vimeo URL.

## Cancellation, history, and validation

- Every callback receives an `AbortSignal`. Pass it to `fetch` and close or ignore application UI when it becomes aborted.
- A late result is ignored after the block is destroyed, replaced, or starts a newer view lifecycle.
- Report source failures from application code so the host can show feedback or send telemetry. Reject the callback on failure and return `null` for normal cancellation; the plugin keeps the document unchanged in both cases, but consumer code must not rely on plugin-side logging as its error-reporting channel.
- One completed source selection is committed as one undo/redo step, even when it returns several gallery items, slides, or attachments.
- Returned URLs are checked by the plugin's media or download URL policy. The application must still enforce authorization, file type, size, malware scanning, and access rules at its own trust boundary.
- Callback results must contain durable URLs if the saved document will be opened in another session or by a renderer.

## Choosing the correct integration

Use `uploadFile` when the starting value is a browser `File`. Use `actions` when the starting value already lives in an application-controlled catalog. Configure both when users need device upload and a media library in the same block.
