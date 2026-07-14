import {
  createDefaultInlineTools,
  createEditor,
  sanitizeHtml,
} from '../../.package-tmp/declaration-tests/core/index.js'
import type {
  BlockPlugin,
  EditorConfig,
  EditorDocument,
  IEditor,
} from '../../.package-tmp/declaration-tests/core/index.js'

declare const holder: HTMLElement
declare const element: HTMLElement

const customPlugin: BlockPlugin<{ text: string }> = {
  type: 'custom',
  title: 'Custom',
  icon: '',
  render: data => {
    element.textContent = data.text
    return element
  },
  save: target => ({ text: target.textContent ?? '' }),
}

const config: EditorConfig = {
  holder,
  plugins: [customPlugin],
}

const editor: IEditor = createEditor(config)
const document: EditorDocument = editor.save()
const tools = createDefaultInlineTools()

void document
void tools
void sanitizeHtml('<p>safe</p>')
