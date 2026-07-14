# Person block plugin

One or more profile cards with cropped avatars, biography, role, and social links.

## Install and register

```bash
npm install @shelamkoff/rector @shelamkoff/cropper
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Person } from '@shelamkoff/rector/plugins/person'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Person()],
})
```

The registered block type is `person`. The class is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{
  "persons": [{
    "avatar": "https://cdn.example/ada.jpg",
    "name": "Ada",
    "role": "Author",
    "bio": "",
    "links": [{ "type": "website", "url": "https://example.com" }]
  }]
}
```

Callback avatar URLs must pass the shared media URL policy. The editor plugin requires `@shelamkoff/cropper`. The multi-card renderer requires `@shelamkoff/carousel`.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string }>` uploads the cropped avatar as `avatar.webp` and must stop work when the supplied signal is aborted. `socialResolvers?: Array<{ test: RegExp | ((url: string) => boolean); type: string; icon?: string }>` extends social-link icon resolution.

## Capabilities

Multiple profiles; tab reordering; avatar crop/upload; social links and deterministic dialog cleanup.

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied `context.mutate()` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls `destroy()` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/person`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
