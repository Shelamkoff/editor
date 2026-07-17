# List block plugin

Ordered and unordered rich-text lists with item splitting, merging, block exit, and partial-selection conversion.

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

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `style` | yes | `ordered` or `unordered`. A newly inserted list uses the toolbox variant selected by the user. |
| `items` | yes | A non-empty array of strings with at least one non-blank item. Each string contains sanitized inline HTML and may reference the block's `inline` map. |

An empty trailing item is an editing state, not valid persisted list data. Pressing Enter in that item removes it and creates the editor's default block after the list as one undoable action. Pressing Enter in the sole empty item converts the list itself to the default block.

In a non-empty item, Enter splits at the caret: content before the caret remains in the current item and content after it moves to a new following item. With a non-collapsed selection, the selected content is removed first; the unselected suffix becomes the new item, including selections that cross several items. At the start of any item except the first, Backspace merges that item into the preceding one. These structural edits each form one undoable history step.

When only part of a list is converted, selected items are removed from the source list, ordered items are renumbered, and the new block is inserted immediately after the list. A text target receives the selected inline markup; a non-text target starts with its own default data.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Inline tools and widgets; ordered/unordered toolbox entries; list paste; Enter splitting; Backspace merging; whole-block conversion; data-aware partial-selection conversion.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/list`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
