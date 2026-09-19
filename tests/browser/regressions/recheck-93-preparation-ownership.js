import { Paragraph } from '../../../plugins/paragraph/index.js'
import { EditorRenderer } from '../../../renderer/index.js'
import { test, make, para, input, assert, equal, pause } from './harness.js'

export function register() {
  test('validation during a command checkpoint cannot mutate or tear down the public editor', () => {
    class InvalidParagraph extends Paragraph {
      validate(data) { return data.text !== 'invalid' }
    }
    let editor
    let armed = false
    let reports = 0
    const blocked = []
    editor = make([para('a', 'valid')], {
      plugins: [new InvalidParagraph()],
      validationMode: 'preserve',
      onValidationError() {
        if (!armed) return
        armed = false
        reports++
        const actions = [
          () => editor.blocks.insert('paragraph', { text: 'unexpected' }),
          () => editor.clear(),
          () => editor.render({ version: '1', blocks: [para('replacement', 'unexpected')] }),
          () => editor.setReadOnly(true),
          () => editor.focus(),
          () => editor.destroy(),
        ]
        for (const action of actions) {
          try { action(); blocked.push(false) }
          catch { blocked.push(true) }
        }
        blocked.push(editor.undo() === false, editor.redo() === false)
      },
    })
    input(editor.blocks.getBlockById('a').contentElement, 'invalid')
    armed = true
    editor.blocks.insert('paragraph', { text: 'second' }, 1, 'b')
    equal(reports, 1)
    equal(blocked, Array(8).fill(true))
    equal(editor.isReady, true)
    equal(editor.save().blocks.map(block => [block.id, block.data.text]), [['a', 'invalid'], ['b', 'second']])
    assert(editor.undo(), 'successful outer command must remain undoable')
    equal(editor.save().blocks.map(block => block.id), ['a'])
  })

  test('renderer disposal is reentrant and exactly once in the real DOM', () => {
    const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false })
    const container = document.createElement('main')
    document.body.appendChild(container)
    let calls = 0
    renderer.registerRenderer({
      type: 'cleanup-probe',
      render(_block, _parse, context) { return context.ownerDocument.createElement('article') },
      destroy() {
        calls++
        if (calls === 1) renderer.destroy(container)
      },
    })
    try {
      renderer.renderTo({ blocks: [{ id: 'a', type: 'cleanup-probe', data: {} }] }, container)
      renderer.destroy(container)
      equal(calls, 1)
      equal(container.childElementCount, 0)
    } finally {
      renderer.destroy()
      container.remove()
    }
  })

  test('async renderer validation preserves source identity across aggregate renders', async () => {
    const first = document.createElement('main')
    const second = document.createElement('main')
    const source = { blocks: [{ id: 'a', type: 'table', data: { content: 'invalid' } }] }
    let reports = 0
    let nestedRejected = false
    const renderer = new EditorRenderer({
      blockTypes: ['table'], injectStyles: false, validationMode: 'strict',
      async onValidationError() {
        reports++
        if (reports > 1) return
        await Promise.resolve()
        try { renderer.renderTo(source, second) }
        catch { nestedRejected = true }
      },
    })
    try {
      let rejected = false
      try { renderer.renderTo(source, first) } catch { rejected = true }
      assert(rejected, 'strict invalid data must still be rejected')
      await pause()
      equal(reports, 1)
      assert(nestedRejected, 'suppressed notification must not bypass strict validation')
    } finally { renderer.destroy() }
  })
}
