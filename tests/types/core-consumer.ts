import {
  createEditor,
} from '../../.package-tmp/declaration-tests/core/index.js'
import type {
  BlockPluginDefinition,
  EditorConfig,
  EditorDocument,
  IEditor,
} from '../../.package-tmp/declaration-tests/core/index.js'

declare const holder: HTMLElement
const schema = {
  currentVersion: 1,
  createDefault: () => ({ text: '' }),
  decode(input: { dataVersion: number; data: unknown }) {
    if (input.dataVersion !== 1) throw new RangeError('dataVersion')
    const data = input.data as { text?: unknown }
    if (typeof data?.text !== 'string') throw new TypeError('text')
    return { dataVersion: 1, data: { text: data.text } }
  },
  encode(data: Readonly<{ text: string }>) {
    return { dataVersion: 1, data: { text: data.text } }
  },
}

const customPlugin: BlockPluginDefinition<{ text: string }> = {
  type: 'custom',
  label: { key: 'title', fallback: 'Custom' },
  icon: '',
  schema,
  setup() {
    return {
      create(initial, context) {
        const element = context.ownerDocument.createElement('p')
        element.textContent = initial.text
        return {
          element,
          read: () => ({ text: element.textContent ?? '' }),
          update(next) { element.textContent = next.text },
          editableFields: () => [{ key: 'text', element, mode: 'plain-text' }],
          setReadOnly(value) { element.contentEditable = value ? 'false' : 'true' },
          destroy() {},
        }
      },
      destroy() {},
    }
  },
}

const config: EditorConfig = {
  holder,
  plugins: [customPlugin],
}

const editor: IEditor = createEditor(config)
const document: EditorDocument = editor.save()
void document
