# LinkPreview block plugin

Link preview card with seven visual templates and optional application-provided metadata.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { createLinkPreviewPlugin } from '@shelamkoff/rector/plugins/link-preview'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createLinkPreviewPlugin()],
})
```

The registered block type is `linkPreview`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{
  "url": "https://example.com",
  "title": "Example",
  "description": "",
  "image": "",
  "favicon": "",
  "domain": "example.com",
  "template": "notion"
}
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `url` | yes | Canonical HTTP(S) external URL. |
| `title`, `description`, `domain` | no | Metadata strings; empty values are allowed. |
| `image`, `favicon` | no | Empty strings or canonical media-policy URLs. |
| `template` | no | `horizontal`, `compact`, `large-top`, `minimal`, `twitter`, `notion`, or `split`; the editor and renderer default to `notion`. |

`template` accepts `horizontal`, `compact`, `large-top`, `minimal`, `twitter`, `notion`, or `split`. Only HTTP(S) links are accepted. Returned image and favicon addresses pass the shared media URL policy.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

`fetchMeta?: (url: string, context: { signal: AbortSignal }) => Promise<{ title?: string; description?: string; image?: string; favicon?: string; domain?: string }>` resolves metadata in application code and must stop work when the supplied signal is aborted. Without this callback, the plugin performs no metadata request: it keeps the sanitized URL, derives `domain`, and leaves the other metadata fields empty until the application or a loaded document supplies them.

When `fetchMeta` is configured, entering a new URL starts one cancellable resolution. The plugin commits the URL and the normalized metadata together after the callback settles, so one URL entry remains one undo/redo step. If resolution fails, the sanitized URL is still committed without optional metadata. A newer URL or block disposal aborts the older request and prevents stale data from being committed.

## Capabilities

URL paste; async metadata; template selector; safe URL assignment and cleanup. Clicking the card never navigates away while the block is editable. The card becomes a normal external link in read-only editor mode and in rendered output.

## Undo, lifecycle, and styles

Each mounted block receives a scoped context. Use `context.updateData(producer)` for data changes, `context.commitDomMutation(operation)` for protected rich-text edits, and `context.beginTask()` for asynchronous results. Each completed action creates one history step. The block instance and its per-editor runtime release their resources through `destroy()`; Rector releases owned styles when their final owner is removed.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/link-preview`. The VitePress guide documents configuration, commands and history, extension contracts, the current document format, styling, security, and lifecycle in a sequential form.

Automatic metadata enrichment does not restart when Undo, Redo, or a failed command reconstructs a checkpoint. Restored URL controls remain editable; explicitly submitting a URL can start a new request. Custom plugins can use the creation-time `context.restoring` flag to avoid repeating automatic document changes during history reconstruction.
