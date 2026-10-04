# Heading block plugin

Heading levels 2-6 with alignment, inline formatting, inline widgets, paste handling, and level controls.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { createHeadingPlugin } from '@shelamkoff/rector/plugins/heading'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createHeadingPlugin()],
})
```

The registered block type is `heading`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

The same subpath exports `HEADING_LEVELS`, a read-only array of `{ level, key, icon }` entries for H2-H6. `key` is a plugin-local localization key and `icon` is trusted built-in SVG markup. Use the array when an application-level heading control must expose exactly the levels supported by the plugin; do not mutate its entries.

## Data

```json
{ "text": "Section", "level": 2 }
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `text` | yes | Sanitized inline HTML. The empty string is a valid editor state. It may reference values from the block's `inline` map. |
| `level` | yes | Integer from `2` through `6`. A newly inserted heading starts at level `2`. |

Alignment is not plugin-owned data in document format v2. The block envelope stores it as `tunes.textAlign`.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Inline tools and widgets; heading-tag paste; level changes; export for conversion.

## Undo, lifecycle, and styles

Each mounted block receives a scoped context. Use `context.updateData(producer)` for data changes, `context.commitDomMutation(operation)` for protected rich-text edits, and `context.beginTask()` for asynchronous results. Each completed action creates one history step. The block instance and its per-editor runtime release their resources through `destroy()`; Rector releases owned styles when their final owner is removed.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/heading`. The VitePress guide documents configuration, commands and history, extension contracts, the current document format, styling, security, and lifecycle in a sequential form.
