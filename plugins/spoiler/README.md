# Spoiler block plugin

User-revealed hidden content with an editable label.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Spoiler } from '@shelamkoff/rector/plugins/spoiler'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Spoiler()],
})
```

The registered block type is `spoiler`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{ "label": "Reveal", "content": "Spoiler text" }
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `label` | yes | String containing sanitized inline HTML; it may be empty. |
| `content` | yes | Non-blank sanitized inline HTML. |

The expanded state is transient and is not stored in block data. The renderer supplies keyboard and `aria-expanded` disclosure semantics.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Inline formatting; editable label/content; merge; accessible disclosure.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/spoiler`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
