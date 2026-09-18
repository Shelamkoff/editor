import { test, make, para, equal } from './harness.js'

export function register() {
  test('public inline metadata is observed once before rehydration', () => {
    let reads = 0
    const inline = {}
    Object.defineProperty(inline, 'w', {
      enumerable: true,
      get() {
        reads++
        return { type: 'probe', data: { value: String(reads) } }
      },
    })

    const probe = {
      type: 'probe',
      createWidget(data, id, context = { ownerDocument: document }) {
        const element = context.ownerDocument.createElement('span')
        element.dataset.inlinePlugin = 'probe'
        element.dataset.id = id || 'w'
        element.dataset.value = String(data.value || '')
        element.textContent = 'probe'
        return element
      },
      hydrate() {},
      getData(element) {
        return { value: element.dataset.value || '' }
      },
    }

    const editor = make([para('a', 'A')], { inlinePlugins: [probe] })
    editor.blocks.insert('paragraph', { text: '{{w}}' }, 1, 'inline-owned', inline)

    equal(reads, 1, 'caller-owned inline metadata must be observed once at the API boundary')
    const saved = editor.save().blocks.find(block => block.id === 'inline-owned')
    equal(saved.inline?.w?.data?.value, '1')
  })
}
