# Columns block plugin

Two- or three-column rich-content layouts.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { createColumnsPlugin } from '@shelamkoff/rector/plugins/columns'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createColumnsPlugin()],
})
```

The registered block type is `columns`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{
  "columns": [
    {
      "id": "column-1",
      "content": "Left"
    },
    {
      "id": "column-2",
      "content": "Right"
    }
  ],
  "layout": "1-1"
}
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `layout` | yes | `1-1`, `1-2`, `2-1`, or `1-1-1`. A new block defaults to `1-1`. |
| `columns` | yes | Array of `{ content: string }` objects. Two-column layouts require exactly two entries; `1-1-1` requires exactly three. Content stores sanitized inline HTML. |

Empty column strings are valid. Changing the layout preserves columns in order. Expanding from two to three columns adds an empty final column. Reducing from three to two columns appends the removed column's non-blank rich text to the second column, separated by `<br>`, so changing the layout does not discard content. Every column supports the editor's enabled inline tools and persistent inline widgets.

During import, surplus columns are appended to the last supported column using the same non-blank rich-text merge policy. Missing columns are padded with empty strings; an unknown layout uses `1-1` without discarding surplus content.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Layout controls; editable column content; validation and document rendering.

## Undo, lifecycle, and styles

Each mounted block receives a scoped context. Use `context.updateData(producer)` for data changes, `context.commitDomMutation(operation)` for protected rich-text edits, and `context.beginTask()` for asynchronous results. Each completed action creates one history step. The block instance and its per-editor runtime release their resources through `destroy()`; Rector releases owned styles when their final owner is removed.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/columns`. The VitePress guide documents configuration, commands and history, extension contracts, the current document format, styling, security, and lifecycle in a sequential form.
