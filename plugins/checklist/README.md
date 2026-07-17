# Checklist block plugin

Checklist with independently checked rich-text items.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Checklist } from '@shelamkoff/rector/plugins/checklist'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Checklist()],
})
```

The registered block type is `checklist`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{ "items": [{ "text": "Ship", "checked": false }] }
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

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/checklist`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
