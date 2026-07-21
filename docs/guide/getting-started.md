# Getting started

Rector is a browser-native block editor. It stores content as a versioned JSON document, provides block and inline editing, and renders the same document without mounting an editor. The package is ESM-only and does not require a UI framework.

This page builds the smallest complete integration. The following chapters explain every option and extension boundary in detail.

## Requirements

- a modern browser with native ES modules;
- Node.js 20 or newer for installation and build tooling;
- an application that can import CSS and ESM packages.

## Install

```bash
npm install @shelamkoff/rector
```

Rector installs its required runtime dependencies automatically. Some media plugins use optional peer dependencies; their individual pages list those packages before the first example.

## Add a holder

Rector owns the contents of the holder for the lifetime of the editor instance. Pass the element itself, not a selector string.

```html
<div id="editor"></div>
```

```css
#editor {
  max-width: 760px;
  margin-inline: auto;
}
```

## Create the editor

Register every block type that the document may contain. The default `injectStyles: true` mode loads the editor, plugin, and dependency styles automatically.

```js
import { createEditor } from '@shelamkoff/rector'
import { Paragraph } from '@shelamkoff/rector/plugins/paragraph'
import { Heading } from '@shelamkoff/rector/plugins/heading'

const holder = document.querySelector('#editor')

const editor = createEditor({
  holder,
  plugins: [new Paragraph(), new Heading()],
  data: {
    version: '1.0.0',
    blocks: [
      {
        id: 'intro',
        type: 'heading',
        data: { text: 'A structured document', level: 2 },
      },
      {
        id: 'body',
        type: 'paragraph',
        data: { text: 'Start editing this text.' },
      },
    ],
  },
  onChange(document) {
    console.log(document)
  },
})
```

For Vite, Nuxt, or another CSS-aware bundler, set `injectStyles: false` and import the base plus selected plugin CSS subpaths, or the all-in-one `@shelamkoff/rector/styles.css`. The styling guide lists both forms.

`createEditor()` returns an editor handle synchronously. When it returns, `editor.isReady` is `true`; `onReady` is useful when initialization must notify another part of the application.

## Save content

Use `save()` in application code. It synchronously returns a detached document object owned by the caller. A block serialization or strict-validation failure is thrown immediately.

```js
const documentData = editor.save()
const json = JSON.stringify(documentData)
```

Rector does not send content to a server and does not choose a storage format beyond the documented JSON contract. Persist `documentData` using your own storage layer.

## Load another document

`render()` replaces the current editor document after validating and normalizing the supplied envelope.

```js
editor.render({
  version: '1.0.0',
  blocks: [
    { id: 'loaded', type: 'paragraph', data: { text: 'Loaded content' } },
  ],
})
```

All block `type` values in the input must have a registered plugin. The validation policy determines what happens to invalid block data; see [Configuration](/guide/configuration).

## Clean up

Call `destroy()` before removing the holder or the view that contains it. Rector then removes its listeners, observers, popups, plugin instances, and injected plugin styles owned by this editor.

```js
editor.destroy()
```

Calling `destroy()` again is safe. After destruction, `isReady` remains readable and returns `false`; every other property or operation throws so that use-after-destroy errors are visible.

## Where to continue

1. Read [Architecture](/guide/architecture) to understand the document, editor, plugin, and renderer boundaries.
2. Choose options in [Configuration](/guide/configuration).
3. Read [Inline tools and inline plugins](/guide/inline-extensions) before extending text behavior.
4. Learn [Commands and history](/guide/commands-history) before writing interactive plugins.
5. Use [Editor API](/guide/editor-api) for application integration.
6. Open the [block plugin catalog](/reference/editor/plugins/index) when selecting document features.
