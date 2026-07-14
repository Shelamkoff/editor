# Columns block plugin

Two- or three-column rich-content layouts.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Columns } from '@shelamkoff/rector/plugins/columns'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Columns()],
})
```

The registered block type is `columns`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{ "columns": [{ "content": "Left" }, { "content": "Right" }], "layout": "1-1" }
```

`layout` accepts `1-1`, `1-2`, `2-1`, or `1-1-1`. The number of columns must match the selected layout.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Layout controls; editable column content; validation and document rendering.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/columns`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
