# Inline plugins

Inline plugins store structured data inside text without turning it into opaque HTML. Rector persists a stable `{{widgetId}}` token in the text field and the corresponding `{ type, data }` record in the block-level `inline` map.

## Built-in plugins

| Plugin | Package entry | Purpose |
| --- | --- | --- |
| [Color](./color/README.md) | `@shelamkoff/rector/inline-plugins/color` | Persisted color sample with an editable value |
| [Mention](./mention/README.md) | `@shelamkoff/rector/inline-plugins/mention` | Searchable entity mention with host-provided data |

## Register in the editor

```js
import { createEditor } from '@shelamkoff/rector'
import { createColorSwatchPlugin } from '@shelamkoff/rector/inline-plugins/color'
import { createMentionPlugin } from '@shelamkoff/rector/inline-plugins/mention'

const editor = createEditor({
  holder,
  plugins,
  inlinePlugins: [
    createColorSwatchPlugin(),
    createMentionPlugin({
      searchFunction: async query => searchPeople(query),
    }),
  ],
})
```

A plugin owns `createWidget(data, id)` and `getData(element)`. It may additionally implement `hydrate`, `onEdit`, `onCommit`, `pasteConfig`, `destroy`, and a matching renderer widget. Preserve the id supplied to `createWidget`; changing it breaks the token-to-data relation.

Mounted changes must use the mutation context supplied by Rector so one completed interaction produces one undo step. Release popup DOM, timers, requests, listeners, and object URLs from the plugin lifecycle.

The VitePress extension guide documents the full contract, security rules, renderer counterpart, history boundary, and lifecycle requirements.
