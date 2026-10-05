# Paragraph block plugin

Editable rich-text paragraph with alignment, inline tools, inline widgets, merge, and block conversion support.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { createParagraphPlugin } from '@shelamkoff/rector/plugins/paragraph'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createParagraphPlugin()],
})
```

The registered block type is `paragraph`. Its factory is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{ "text": "Hello <strong>world</strong>" }
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `text` | yes | Sanitized inline HTML. The empty string is a valid editor state. Serialized text may contain placeholders whose data lives in the block's `inline` map. |

Alignment is not plugin-owned data in document format v2. The block envelope stores it as `tunes.textAlign` with `left`, `center`, `right`, or `justify`.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

`placeholder?: string` overrides the empty paragraph prompt.

## Capabilities

Inline tools and widgets; paragraph merge; export for conversion.

## Undo, lifecycle, and styles

Each mounted block receives a scoped context. Use `context.updateData(producer)` for data changes, `context.commitDomMutation(operation)` for protected rich-text edits, and `context.beginTask()` for asynchronous results. Each completed action creates one history step. The block instance and its per-editor runtime release their resources through `destroy()`; Rector releases owned styles when their final owner is removed.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/paragraph`. The VitePress guide documents configuration, commands and history, extension contracts, the current document format, styling, security, and lifecycle in a sequential form.
