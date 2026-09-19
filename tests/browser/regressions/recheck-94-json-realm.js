import { EditorRenderer } from '../../../renderer/index.js'
import { test, make, equal, assert } from './harness.js'

export function register() {
  for (const revisioned of [false, true]) {
    test(`editor and renderer accept foreign JSON (${revisioned ? 'revision' : 'deep signature'})`, () => {
      const frame = document.createElement('iframe')
      document.body.appendChild(frame)
      const renderer = new EditorRenderer({ blockTypes: ['paragraph'], injectStyles: false })
      const container = document.createElement('main')
      document.body.appendChild(container)
      try {
        const foreign = frame.contentWindow.JSON.parse(JSON.stringify({
          version: '1',
          blocks: [{ id: 'foreign', type: 'paragraph', data: { text: 'cross-realm content' },
            ...(revisioned ? { revision: 'r1' } : {}) }],
        }))
        const editor = make(foreign.blocks)
        equal(editor.save().blocks[0].data.text, 'cross-realm content')
        editor.render(foreign)
        equal(editor.save().blocks[0].data.text, 'cross-realm content')
        const output = renderer.renderBlock(foreign.blocks[0])
        equal(output.textContent, 'cross-realm content')
        const aggregate = renderer.render(foreign)
        equal(aggregate.textContent, 'cross-realm content')
        renderer.renderTo(foreign, container)
        const mounted = container.querySelector('[data-block-id="foreign"]')
        equal(mounted.textContent, 'cross-realm content')
        equal(foreign.blocks[0].data.text, 'cross-realm content')
        if (revisioned) {
          Object.defineProperty(foreign.blocks[0].data, 'text', {
            enumerable: true,
            get() { throw new Error('unchanged foreign revision was traversed') },
          })
        }
        renderer.renderTo(foreign, container)
        assert(container.querySelector('[data-block-id="foreign"]') === mounted,
          'unchanged foreign block must reuse its real DOM')
      } finally {
        renderer.destroy()
        container.remove()
        frame.remove()
      }
    })
  }
}
