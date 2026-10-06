# Table block plugin

Editable table with an optional heading row.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { createTablePlugin } from '@shelamkoff/rector/plugins/table'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createTablePlugin()],
})
```

The registered block type is `table`. Its factory is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{
  "withHeadings": true,
  "rows": [
    {
      "id": "row-1",
      "cells": [
        {
          "id": "cell-1",
          "text": "Name"
        },
        {
          "id": "cell-2",
          "text": "Value"
        }
      ]
    },
    {
      "id": "row-2",
      "cells": [
        {
          "id": "cell-1",
          "text": "A"
        },
        {
          "id": "cell-2",
          "text": "1"
        }
      ]
    }
  ]
}
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `content` | yes | Non-empty rectangular array of rows with at least one column. Every cell must be a string. New tables start as a 3-by-3 grid. |
| `withHeadings` | no | Boolean indicating whether the first row is a heading row; defaults to `false`. |

Cells store sanitized inline HTML. Every cell supports the editor's enabled inline tools and persistent inline widgets; widget data is marshalled through the block-level `inline` map in the same way as other rich-text blocks.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Inline formatting; row/column editing; heading-row setting; table paste; export for conversion.

## Undo, lifecycle, and styles

Native input in registered editable fields and data changes through `context.updateData()` or `context.commitDomMutation()` enter the editor's canonical transaction pipeline. One completed document edit is one undo/redo step; view-only controls do not create history. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/table`. The VitePress guide documents configuration, commands and history, extension contracts, the current document format, styling, security, and lifecycle in a sequential form.
