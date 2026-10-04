import {
  createEditor,
} from '../../.package-tmp/declaration-tests/core/index.js'
import type {
  BlockPluginDefinition,
  EditorConfig,
  EditorDocument,
  EditorEventMap,
  IEditor,
  TransactionCommitted,
} from '../../.package-tmp/declaration-tests/core/index.js'
import type {
  BlockCapabilities,
  ClipboardCapability,
  DataTask,
  HtmlImportCapability,
} from '../../.package-tmp/declaration-tests/types.js'

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

const capabilities: BlockCapabilities<{ text: string }> = {
  htmlImport: {
    matchesRoot(element) { return element.tagName === 'P' },
    importRoot(element, context) {
      return { text: context.serializeRichText(element) }
    },
  } satisfies HtmlImportCapability<{ text: string }>,
  clipboard: {
    slice(data, context) {
      const field = context.field('text')
      return {
        parts: [{ kind: 'rich-text', html: field?.selected ?? data.text }],
        remaining: field ? { text: field.before + field.after } : data,
        focus: { fieldKey: 'text', offset: 0 },
      }
    },
  } satisfies ClipboardCapability<{ text: string }>,
}

const customPlugin: BlockPluginDefinition<{ text: string }> = {
  type: 'custom',
  label: { key: 'title', fallback: 'Custom' },
  icon: '',
  schema,
  capabilities,
  setup() {
    return {
      create(initial, context) {
        const task: DataTask<{ text: string }> = context.beginTask()
        task.cancel()
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
const unsubscribe = editor.on('transaction:committed', (event: TransactionCommitted) => {
  const origin: EditorEventMap['transaction:committed']['origin'] = event.origin
  void origin
})
unsubscribe()
void document
