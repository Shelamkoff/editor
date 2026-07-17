# Block plugins

The package ships 21 editable block plugins. Import a single plugin from `@shelamkoff/rector/plugins/<path>`, the complete synchronous preset from `@shelamkoff/rector/plugins`, or a document-driven subset from `@shelamkoff/rector/plugins/async`.

| Plugin | Block type | Purpose |
| --- | --- | --- |
| [Paragraph](./paragraph/README.md) | `paragraph` | Editable rich-text paragraph with alignment, inline tools, inline widgets, merge, and block conversion support. |
| [Heading](./heading/README.md) | `heading` | Heading levels 2-6 with alignment, inline formatting, inline widgets, paste handling, and level controls. |
| [List](./list/README.md) | `list` | Ordered and unordered rich-text lists with item splitting, merging, block exit, and conversion of selected items. |
| [Quote](./quote/README.md) | `quote` | Quotation text with an optional caption. |
| [Code](./code/README.md) | `code` | Code block with a language selector and optional syntax highlighting. |
| [Image](./image/README.md) | `image` | Uploadable image with caption, sizing, border, background, and object-fit controls. |
| [Delimiter](./delimiter/README.md) | `delimiter` | A visual section separator with no content payload. |
| [Table](./table/README.md) | `table` | Editable table with an optional heading row. |
| [Checklist](./checklist/README.md) | `checklist` | Checklist with independently checked rich-text items. |
| [Warning](./warning/README.md) | `warning` | Callout block with editable title and message fields. |
| [Embed](./embed/README.md) | `embed` | YouTube and Vimeo embed block with caption, cover image, and preview metadata. |
| [Raw](./raw/README.md) | `raw` | Raw HTML authoring block. |
| [Gallery](./gallery/README.md) | `gallery` | Multi-image gallery with layouts, captions, appearance settings, reordering, and viewer options. |
| [CarouselBlock](./carousel/README.md) | `carousel` | Mixed image, video, and sanitized HTML slides with navigation, pagination, thumbnails, autoplay, and ordering controls. |
| [Attaches](./attaches/README.md) | `attaches` | One or more downloadable files with selectable presentation variants. |
| [LinkPreview](./link-preview/README.md) | `linkPreview` | Link preview card with seven visual templates and optional application-provided metadata. |
| [Toggle](./toggle/README.md) | `toggle` | Collapsible block with editable title, rich content, and persistent open state. |
| [Columns](./columns/README.md) | `columns` | Two- or three-column rich-content layouts. |
| [Spoiler](./spoiler/README.md) | `spoiler` | User-revealed hidden content with an editable label. |
| [Poll](./poll/README.md) | `poll` | Single- or multiple-choice poll with local results or an application-provided live data source. |
| [Person](./person/README.md) | `person` | One or more profile cards with cropped avatars, biography, role, and social links. |

## Loading only document types

```js
import { createBlockPluginsAsync } from '@shelamkoff/rector/plugins/async'

const plugins = await createBlockPluginsAsync(documentData, {
  image: { uploadFile },
  gallery: { uploadFile },
})
```

The async loader deduplicates imports and preserves the first-occurrence order from the supplied type list or document. When no source is supplied, it uses the built-in catalog order. Unknown types reject instead of being silently ignored.

## Authoring

The VitePress extension guide documents the required contract, optional capabilities, command boundaries, text-field mapping, styles, localization, lifecycle, security, and the matching renderer contract.
