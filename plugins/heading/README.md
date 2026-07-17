# Heading block plugin

Heading levels 2-6 with alignment, inline formatting, inline widgets, paste handling, and level controls.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Heading } from '@shelamkoff/rector/plugins/heading'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Heading()],
})
```

The registered block type is `heading`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

The same subpath exports `HEADING_LEVELS`, a read-only array of `{ level, key, icon }` entries for H2-H6. `key` is a plugin-local localization key and `icon` is trusted built-in SVG markup. Use the array when an application-level heading control must expose exactly the levels supported by the plugin; do not mutate its entries.

## Data

```json
{ "text": "Section", "level": 2, "align": "left" }
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `text` | yes | Non-blank sanitized inline HTML. It may reference values from the block's `inline` map. |
| `level` | yes | Integer from `2` through `6`. A newly inserted heading starts at level `2`. |
| `align` | no | `left`, `center`, `right`, or `justify`; omitted means normal text alignment. |

An empty heading may exist as an editing draft, but strict document validation rejects it until `text` is non-blank.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Inline tools and widgets; heading-tag paste; level changes; export for conversion.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/heading`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
