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

## Embedded HTML content

Pass `contentStyles: readonly string[]` to `createEditor()` and `EditorRenderer` to supply self-contained, application-owned CSS text for Raw and HTML Carousel content. For example, `contentStyles: ['body { font: 20px sans-serif; } .article-accent { color: #12549c; }']`. These styles apply even with `injectStyles:false`; the option controls automatic UI styles.

Content uses its own scriptless document and follows the available width and natural content height. Page stylesheets and classes are not copied automatically. Move the relevant content rules into `contentStyles` when migrating a theme. Viewport lengths refer to the containing page, and explicit content scrollers remain usable. The original HTML stays in the author record.

## Inline content classes

The same `contentStyles` input supplies rich text and completed derived author views. Use `:scope` for each content field; for example, `contentStyles: [':scope { font-size:20px; } :scope span.article-accent, :scope code.article-accent { color:#12549c; font-size:1.5em; }']`. Rules retain normal CSS specificity and cascade. Move the relevant page rules with equivalent specificity; library defaults can otherwise win. These trusted CSS strings are application configuration, separate from the narrow properties permitted in author-supplied inline style attributes.

Author span/code classes keep their original HTML spelling in saved data. Their live DOM attribute uses a private namespace so ordinary page class selectors cannot activate interface rules. For DOM observation, use `span[*|class~="article-accent"]` and `getAttribute('class')`; `classList` and ordinary `.article-accent` queries describe the interface class namespace. Editor fields remain flat DOM with native selection and overflow; content CSS does not wrap or clip glyphs.

Styles are leased per actual owning document and released with their owner. `renderTo(data, foreignContainer)` uses that container's document. When adopting a detached `renderBlock()` result into another document, acquire the existing `renderer.injectStyles(targetDocument)` handle there and release that handle when finished. Page stylesheets are never copied implicitly.

Use `setSanitizedHtml()`, `insertSanitizedHtml()` or the supplied parser for live DOM. `sanitizeHtml()` and `normalizeRichText()` remain canonical HTML string APIs; serialization does not carry the live attribute namespace. Re-parsing through your own `innerHTML` restores ordinary classes, and that presentation must provide its own selected content boundary.

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

Extension UI styles use the definition's published URLs; core does not read private factory state. The separate `contentStyles` input above supplies trusted content CSS and is never read from persisted HTML or sandbox flags.

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
