import { test, make, para, equal, assert } from './harness.js'

export function register() {
  const operations = {
    insert: (api, index) => api.insert('paragraph', { text: 'X' }, index, 'x'),
    moveFrom: (api, index) => api.move(index, 1),
    moveTo: (api, index) => api.move(0, index),
    remove: (api, index) => api.remove(index),
    convert: (api, index) => api.convert(index, 'paragraph'),
    focus: (api, index) => api.setCurrentIndex(index),
  }
  for (const [name, operation] of Object.entries(operations)) {
    test(`${name} rejects non-integer indices without changing the model or DOM`, () => {
      for (const index of [1.5, NaN, Infinity, '1']) {
        const editor = make([para('a', 'A'), para('b', 'B')])
        let error
        try { operation(editor.blocks, index) } catch (cause) { error = cause }
        assert(error instanceof RangeError || error instanceof TypeError, 'invalid index must be rejected')
        equal(editor.save().blocks.map(block => block.id), ['a', 'b'])
        equal([...editor.rootElement.querySelectorAll('.oe-block')].map(el => el.dataset.blockId), ['a', 'b'])
        equal(editor.canUndo, false)
      }
    })
  }
}
