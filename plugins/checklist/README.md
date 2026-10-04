# Checklist block plugin

Checklist with independently checked rich-text items.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { createChecklistPlugin } from '@shelamkoff/rector/plugins/checklist'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createChecklistPlugin()],
})
```

The registered block type is `checklist`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{
  "items": [
    {
      "id": "item-1",
      "text": "Ship",
      "checked": false
    }
  ]
}
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `items` | yes | A non-empty array of objects. Each object requires string `text` and boolean `checked`. Text supports sanitized inline markup and inline widgets. |

The document validator permits an empty `text` string, because an empty item is a valid editing state. Enter in an empty last item removes it and creates the default block after the checklist; Enter in the sole empty item converts the checklist itself. Each transition is one undoable action.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Inline tools and widgets; item add/remove/toggle; merge; export for conversion.

## Undo, lifecycle, and styles

Each mounted block receives a scoped context. Use `context.updateData(producer)` for data changes, `context.commitDomMutation(operation)` for protected rich-text edits, and `context.beginTask()` for asynchronous results. Each completed action creates one history step. The block instance and its per-editor runtime release their resources through `destroy()`; Rector releases owned styles when their final owner is removed.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/checklist`. The VitePress guide documents configuration, commands and history, extension contracts, the current document format, styling, security, and lifecycle in a sequential form.
