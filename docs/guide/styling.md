# Styling

Rector v2 treats styles as owned resources. Core CSS and every extension stylesheet are declared as URLs and acquired through a reference-counted registry in the editor's owning document.

## Automatic styles

With the default `injectStyles: true`, `createEditor()` acquires:

- core variables and the selected light/dark theme;
- each block definition's `styles` URLs;
- each inline definition's `styles` URLs.

Two editors in the same document share one link per URL. The link is removed only after the last owner is destroyed.

```js
import { createEditor } from '@shelamkoff/rector'
import { createParagraphPlugin } from '@shelamkoff/rector/plugins/paragraph'

const editor = createEditor({
  holder,
  plugins: [createParagraphPlugin()],
  theme: 'dark',
})
```

## Manual style mode

Set editor-level `injectStyles: false` when the host bundles CSS itself:

```js
const editor = createEditor({
  holder,
  plugins: [createParagraphPlugin({ injectStyles: false })],
  injectStyles: false,
})
```

In manual mode Rector acquires neither core nor definition styles. Import the required files in the host bundle. Built-in factories that expose their own `injectStyles` option can suppress their definition-specific URL as well.

## Extension styles

A custom block definition publishes immutable style URLs:

```js
export function createCalloutPlugin() {
  return Object.freeze({
    type: 'callout',
    label: Object.freeze({ key: 'title', fallback: 'Callout' }),
    icon: '<svg viewBox="0 0 24 24">...</svg>',
    styles: Object.freeze([
      new URL('./callout.css', import.meta.url).href,
    ]),
    schema,
    capabilities,
    setup,
  })
}
```

Do not expose raw CSS strings as runtime configuration. Do not read private factory state from core. The definition itself is the declarative contract.

## Stable selectors

Core owns the editor/block shells. Stable high-level selectors include:

- `.oe-editor`
- `.oe-blocks`
- `.oe-block`
- `.oe-toolbar`
- `.oe-toolbox`
- `.oe-settings-menu`
- `.oe-inline-toolbar`

Built-in plugins expose their documented roots, for example `.oe-carousel-block`, `.oe-gallery`, `.oe-image`, and `.oe-poll`.

Do not persist or query a block DOM node as application state. Public host code uses `editor.blocks` snapshots and IDs; projected DOM may be replaced after render, conversion, history replay, read-only transitions, or schema-driven updates.

## Themes

The editor root receives either `.oe-theme-light` or `.oe-theme-dark`. Theme variables are declared in `core/themes/variables.css`; the light/dark files supply values.

Extension CSS should consume the `--oe-*` variables instead of duplicating theme colors.

## Renderer styles

Editor and renderer style ownership are independent. `EditorRenderer` acquires the `styles` URLs of registered block and inline renderers unless its own `injectStyles` is disabled. Destroy the renderer or rendered owner to release those references.

## CSS safety

Keep extension CSS scoped beneath its root class. Avoid selectors that target arbitrary application DOM, and avoid using style state as serialized data. The canonical document remains the only persistence source.
