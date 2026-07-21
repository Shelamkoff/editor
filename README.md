# @shelamkoff/rector

Rector is an extensible browser-native block editor with atomic undo and redo, versioned JSON documents, inline formatting, block plugins, and document rendering.
![Editor demo](https://github.com/Shelamkoff/editor/blob/master/docs/public/editor.png)

## Documentation

The complete guides, API reference, extension contracts, plugin catalog, and live demo are published with VitePress:

- [English documentation](https://shelamkoff.github.io/editor/)
- [Документация на русском](https://shelamkoff.github.io/editor/ru/)
- [Live demo](https://shelamkoff.github.io/editor/#demo)

## Installation

```bash
npm install @shelamkoff/rector
```

See the [getting started guide](https://shelamkoff.github.io/editor/guide/getting-started) for setup, required styles, plugin registration, document persistence, and lifecycle management.

## Styles

`createEditor()` and `createEditorRenderer()` use `injectStyles: true` by default. They load only the styles declared by the registered extensions and release their reference-counted `<link>` elements on full destruction.

Bundler-based applications can instead set `injectStyles: false` and import CSS explicitly. Use `@shelamkoff/rector/styles.css` for every built-in style, or combine `styles/editor.css` / `styles/renderer.css` with selected subpaths such as `plugins/image/styles.css`, `inline-plugins/color/styles.css`, and `renderer/renderers/carousel/styles.css`.

## Project

- [Source code and issues](https://github.com/Shelamkoff/editor)
- [MIT License](./LICENSE)
