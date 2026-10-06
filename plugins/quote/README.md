# Quote block plugin

Quotation text with an optional caption.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { createQuotePlugin } from '@shelamkoff/rector/plugins/quote'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createQuotePlugin()],
})
```

The registered block type is `quote`. Its factory is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{ "text": "Quote", "caption": "Author" }
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `text` | yes | Non-blank sanitized inline HTML. |
| `caption` | yes | A string; it may be empty. |

Both fields participate in inline-widget marshaling. A new quote can be an empty draft, but strict validation requires non-blank `text` before persistence.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Inline tools and widgets; blockquote paste; merge; export for conversion.

## Undo, lifecycle, and styles

Native input in registered editable fields and data changes through `context.updateData()` or `context.commitDomMutation()` enter the editor's canonical transaction pipeline. One completed document edit is one undo/redo step; view-only controls do not create history. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/quote`. The VitePress guide documents configuration, commands and history, extension contracts, the current document format, styling, security, and lifecycle in a sequential form.
