import { EditorRenderer } from '../../../renderer/index.js'
import { test, make, equal } from './harness.js'

export function register() {
  test('editor and renderer accept JSON produced by another browsing realm', () => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    const renderer = new EditorRenderer({ blockTypes: ['paragraph'], injectStyles: false })
    let output
    try {
      const foreign = frame.contentWindow.JSON.parse(JSON.stringify({
        version: '1',
        blocks: [{ id: 'foreign', type: 'paragraph', data: { text: 'cross-realm content' } }],
      }))
      const editor = make(foreign.blocks)
      equal(editor.save().blocks[0].data.text, 'cross-realm content')
      editor.render(foreign)
      equal(editor.save().blocks[0].data.text, 'cross-realm content')
      output = renderer.renderBlock(foreign.blocks[0])
      equal(output.textContent, 'cross-realm content')
      equal(foreign.blocks[0].data.text, 'cross-realm content')
    } finally {
      renderer.destroy(output)
      frame.remove()
    }
  })
}
