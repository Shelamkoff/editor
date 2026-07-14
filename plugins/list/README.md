# List block plugin

Ordered and unordered rich-text lists with keyboard indentation behavior.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { List } from '@shelamkoff/rector/plugins/list'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new List()],
})
```

The registered block type is `list`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{ "style": "unordered", "items": ["One", "Two"] }
```

`style` is `ordered` or `unordered`. Every item uses the shared sanitized inline-markup and inline-widget contract. When only part of a list is converted, selected items are removed from the source list, ordered items are renumbered, and the new block is inserted immediately after the list. A text target receives the selected inline markup; a non-text target starts with its own default data.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Inline tools and widgets; ordered/unordered toolbox entries; list paste; merge; whole-block conversion; data-aware partial-selection conversion.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/list`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
