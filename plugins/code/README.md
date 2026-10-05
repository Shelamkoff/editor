# Code block plugin

Code block with a language selector and optional syntax highlighting.

## Install and register

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { createCodePlugin } from '@shelamkoff/rector/plugins/code'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [createCodePlugin()],
})
```

The registered block type is `code`. Its factory is also exported by the complete `@shelamkoff/rector/plugins` preset and can be loaded through `@shelamkoff/rector/plugins/async`.

## Data

```json
{ "code": "const value = 1", "language": "javascript" }
```

### Field reference

| Field | Required | Meaning and constraints |
| --- | --- | --- |
| `code` | yes | Non-blank source text. It is never executed as HTML. |
| `language` | no | Language identifier used for highlighting. Saving a new block writes `auto` until the user selects another language. Unknown strings remain valid data and fall back to plain text when the highlighter cannot resolve them. |

An empty code block is allowed as an editing draft but fails strict persisted-data validation.

## Configuration

Every built-in block plugin accepts two style ownership options: `injectStyles?: boolean` defaults to `true`; set it to `false` when the host bundles that plugin's CSS. `css?: string` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.

`hljs?: object` supplies a compatible highlight.js instance. Without it the bundled highlighting runtime is loaded lazily; if highlighting is unavailable, code remains readable as plain text.

The language menu contains the built-in identifiers used by the bundled highlighter. Documents may also contain any non-empty language string. Such a value is preserved and displayed even when it is absent from the menu; if the active highlighting runtime does not recognize it, the block falls back to escaped plain text. The copy button uses the browser Clipboard API. When that API is unavailable or rejects the write, the document and button state remain unchanged.

## Capabilities

Code/pre tag paste; fenced-code pattern paste; keyboard-accessible language selection and filtering; optional syntax highlighting; Clipboard API copy; export for conversion.

Cross-block conversion creates one Code block with all selected text. Author markup is decoded to text, line breaks and HTML entities are preserved, and literal source code stays literal. Unselected endpoint fields remain in their original blocks. The conversion is one history action; linked inline widgets that Code cannot preserve cause an atomic rejection.

## Undo, lifecycle, and styles

Each mounted block receives a scoped context. Use `context.updateData(producer)` for data changes, `context.commitDomMutation(operation)` for protected rich-text edits, and `context.beginTask()` for asynchronous results. Each completed action creates one history step. The block instance and its per-editor runtime release their resources through `destroy()`; Rector releases owned styles when their final owner is removed.

Do not remove the editor holder without first calling `editor.destroy()`.

## Document output

Use the matching renderer from `@shelamkoff/rector/renderer/renderers/code`. The VitePress guide documents configuration, commands and history, extension contracts, the current document format, styling, security, and lifecycle in a sequential form.
