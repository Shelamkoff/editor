# Paragraph block plugin

Editable rich-text paragraph with alignment, inline tools, inline widgets, merge, and block conversion support.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Paragraph } from '@shelamkoff/rector/plugins/paragraph'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Paragraph()],
})
```

The registered block type is `paragraph`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{ "text": "Hello <strong>world</strong>", "align": "left" }
```

`align` accepts `left`, `center`, `right`, or `justify`. `text` contains sanitized inline HTML and may contain inline-widget placeholder tokens while serialized.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

`placeholder?: string` overrides the empty paragraph prompt.

## Capabilities

Inline tools and widgets; paragraph merge; export for conversion.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/paragraph`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
