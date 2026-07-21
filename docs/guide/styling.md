# Styling and themes

Rector exposes stable root classes and CSS custom properties. It supports one style switch with two delivery paths: automatic reference-counted `<link>` elements for browser-native use, or explicit CSS imports for bundlers.

## Automatic styles (default)

```js
const editor = createEditor({
  holder,
  plugins,
  inlinePlugins,
  injectStyles: true,
})
```

`injectStyles` defaults to `true`. Rector loads the editor base and theme styles, every registered block plugin stylesheet, every registered inline-plugin stylesheet, and their declared dependency styles. Identical URLs are reference-counted across editor instances and removed after the last owner is destroyed.

The renderer uses the same option and automatically loads its base and registered renderer styles on the first render:

```js
const renderer = createEditorRenderer({ injectStyles: true })
renderer.renderTo(documentData, article)
renderer.destroy()
```

## Bundler-managed styles

For Vite, Nuxt, or another CSS-aware bundler, disable runtime links and import only the styles used by the application:

```js
import '@shelamkoff/rector/styles/editor.css'
import '@shelamkoff/rector/plugins/image/styles.css'
import '@shelamkoff/rector/inline-plugins/color/styles.css'

const editor = createEditor({
  holder,
  plugins,
  inlinePlugins,
  injectStyles: false,
})
```

Renderer styles have equivalent subpaths:

```js
import '@shelamkoff/rector/styles/renderer.css'
import '@shelamkoff/rector/renderer/renderers/carousel/styles.css'

const renderer = createEditorRenderer({ injectStyles: false })
```

`@shelamkoff/rector/styles.css` is the all-in-one alternative containing editor, inline-plugin, and renderer CSS for every built-in extension. Import package CSS before application overrides and scope overrides under your holder so multiple editors can have independent visual systems.

## Select a theme

```js
const editor = createEditor({
  holder,
  plugins,
  theme: 'light',
})
```

The root receives `.oe-theme-light` or `.oe-theme-dark`. The default is `dark`. For a runtime switch, replace those classes on `editor.rootElement`; the `theme` configuration itself is read at creation.

```js
function setTheme(editor, theme) {
  editor.rootElement.classList.toggle('oe-theme-light', theme === 'light')
  editor.rootElement.classList.toggle('oe-theme-dark', theme === 'dark')
}
```

## Core design variables

Define overrides on `.oe-editor` or a theme class inside your application scope.

```css
.article-editor .oe-editor {
  --oe-font: Inter, system-ui, sans-serif;
  --oe-font-mono: 'JetBrains Mono', monospace;
  --oe-font-size: 16px;
  --oe-line-height: 1.7;
  --oe-block-gap: 0px;
  --oe-block-spacing: 1.25rem;
  --oe-radius: 10px;
  --oe-radius-sm: 5px;
  --oe-transition: 0.15s ease;
}

.article-editor .oe-theme-light {
  --oe-bg: #ffffff;
  --oe-surface: #f8fafc;
  --oe-card: #ffffff;
  --oe-card-hover: #eef2f7;
  --oe-border: #d8dee8;
  --oe-border-hover: #b9c3d1;
  --oe-text-1: #151a22;
  --oe-text-2: #465160;
  --oe-text-3: #758195;
  --oe-accent: #6d4de6;
  --oe-accent-alpha: rgb(109 77 230 / 12%);
  --oe-border-focus: #6d4de6;
  --oe-selection-bg: rgb(109 77 230 / 20%);
}
```

Additional public variables used across editor UI include `--oe-surface-2`, `--oe-surface-elevated`, `--oe-surface-hover`, `--oe-input-bg`, `--oe-input-bg-hover`, `--oe-success`, `--oe-danger`, `--oe-text-on-accent`, `--oe-toolbar-bg`, `--oe-toolbar-border`, `--oe-toolbar-shadow`, `--oe-mark-bg`, and `--oe-overlay`.

Override semantic variables rather than individual popup or button colors. This keeps toolbars, settings, dialogs, selection, and plugins consistent.

## Stable editor selectors

| Purpose | Selector |
| --- | --- |
| Editor root | `.oe-editor` |
| Blocks container | `.oe-blocks` |
| Block wrapper | `.oe-block` |
| Focused block | `.oe-block--focused` |
| Block toolbar | `.oe-toolbar` |
| Block toolbox | `.oe-toolbox` |
| Settings menu | `.oe-settings-menu` |
| Inline toolbar | `.oe-inline-toolbar` |
| Slash menu | `.oe-slash-menu` |
| Tooltip | `.oe-tooltip` |

Use `:focus-visible` for keyboard focus. Do not remove the visible focus state without replacing it with an equally clear indicator.

## Built-in block selectors

| Block | Root selector |
| --- | --- |
| Paragraph | `.oe-paragraph` |
| Heading | `.oe-heading` |
| List | `.oe-list` |
| Quote | `.oe-quote` |
| Code | `.oe-code-wrap` |
| Image | `.oe-image` |
| Gallery | `.oe-gallery` |
| Carousel | `.oe-carousel-block` |
| Embed | `.oe-embed` |
| Table | `.oe-table-wrapper` |
| Attachments | `.oe-attaches` |
| Checklist | `.oe-checklist` |
| Toggle | `.oe-toggle` |
| Columns | `.oe-columns` |
| Spoiler | `.oe-spoiler` |
| Warning | `.oe-warning` |
| Delimiter | `.oe-delimiter` |
| Poll | `.oe-poll` |
| Person | `.oe-person` |
| Link preview | `.oe-lp` |
| Raw HTML | `.oe-raw` |

```css
.article-editor .oe-paragraph {
  max-width: 72ch;
}

.article-editor .oe-heading--h2 {
  margin-block-start: 2.5rem;
  font-size: 2rem;
}
```

Do not target generated ids, DOM depth, transient toolbar positions, or undocumented classes. Those are implementation details.

## Plugin stylesheet ownership

A custom plugin declares stylesheet URLs on its constructor:

```js
export class Callout {
  static styles = [new URL('./callout.css', import.meta.url).href]
  type = 'callout'
}
```

Rector collects block `static styles` and inline-plugin `styles` into the same reference-counted owner. Renderer instances collect the `styles` arrays of their registered renderers. Do not remove injected link elements manually.

Built-in plugin constructors support `injectStyles: false` when the host bundles plugin CSS itself. The optional `css` string adds one host-provided stylesheet URL after the default, or supplies the replacement URL when default injection is disabled.

```js
import { Paragraph } from '@shelamkoff/rector/plugins/paragraph'

new Paragraph({
  injectStyles: false,
  css: new URL('./paragraph.application.css', import.meta.url).href,
})
```

A custom plugin that accepts the same options must expose its constructor configuration through `getPluginConfig()`. Extending `BlockPluginAbstract` supplies that behavior.

In host-managed mode the application is responsible for including every required stylesheet and for the lifecycle of its own link or style bundle.

## Authoring plugin CSS

Scope an extension below one stable plugin class and use Rector variables for shared semantics:

```css
.callout {
  padding: 1rem;
  color: var(--oe-text-1);
  background: var(--oe-card);
  border: 1px solid var(--oe-border);
  border-left: 3px solid var(--oe-accent);
  border-radius: var(--oe-radius);
}

.callout:focus-visible {
  outline: 2px solid var(--oe-border-focus);
  outline-offset: 2px;
}
```

Include reduced-motion handling for nonessential extension animation and keep text contrast readable in both built-in themes.

## Renderer styles

Output rendering has a separate stylesheet lifecycle. Do not rely on editor UI classes in published content. With automatic styles enabled, rendering acquires the required URLs lazily; destroying the last owned result or calling a full `renderer.destroy()` releases them.

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'

const renderer = createEditorRenderer({ classPrefix: 'article' })
renderer.renderTo(documentData, article)
renderer.destroy()
```

`classPrefix` changes the output namespace. `renderer.injectStyles()` remains available when styles must be acquired before the first render; it returns an independent owner that must be destroyed. In bundler-managed mode, import `@shelamkoff/rector/styles/renderer.css` and every selected renderer subpath, then create the renderer with `injectStyles: false`.
