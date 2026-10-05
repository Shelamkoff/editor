# Raw block plugin

Raw HTML authoring block.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { createRawPlugin } from '@shelamkoff/rector/plugins/raw'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createRawPlugin()],
})
```

The registered block type is `raw`. Its factory is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{ "html": "<section>Content</section>" }
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `html` | yes | Non-blank HTML source string. |

HTML stays inert in the source editor. Tab indents the selected lines and Shift+Tab removes one leading tab or up to two leading spaces; each indentation action is one history step. The preview is shown automatically in read-only mode and can be toggled while editing. Returning from preview focuses the source input and preserves its caret or selection, so the next keystroke continues editing at that position. Switching modes does not change the document or history. Both the editor preview and the matching renderer sanitize the source before mounting it. The editor preview additionally uses a sandboxed iframe without script permissions. Active elements, unsafe URLs, event attributes, and unsafe CSS are removed, but allowed remote images and other safe resources can still cause browser requests, so the host remains responsible for its network and content policy. An empty draft does not pass strict persisted-data validation.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

## Capabilities

Raw text editing; multiline Tab and Shift+Tab indentation; sandboxed editor preview; sanitized document rendering; automatic preview in read-only mode.

## Undo, lifecycle, and styles

Native input in registered editable fields and data changes through `context.updateData()` or `context.commitDomMutation()` enter the editor's canonical transaction pipeline. One completed document edit is one undo/redo step; view-only controls do not create history. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/raw`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
