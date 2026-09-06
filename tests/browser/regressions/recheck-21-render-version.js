import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, para, equal, assert } from './harness.js'

export function register() {
  test('render change observers read the new version and blocks as one state', () => {
    const editor = make([para('a', 'Old')])
    const received = []
    editor.events.on('editor:changed', () => {
      const document = editor.save()
      received.push([document.version, document.blocks.map(block => block.data.text)])
    })
    editor.render({ version: 'v2', blocks: [para('b', 'New')] })
    equal(received, [['v2', ['New']]])
    editor.undo()
    equal(editor.save().version, '1')
    editor.redo()
    equal(editor.save().version, 'v2')
    equal(received, [['v2', ['New']], ['1', ['Old']], ['v2', ['New']]])
  })

  test('a render requested by a change observer is not overwritten by the outer envelope', () => {
    const editor = make([para('a', 'Old')])
    const received = []
    editor.events.on('editor:changed', () => {
      const document = editor.save()
      received.push([document.version, document.blocks[0].data.text])
      if (received.length === 1) editor.render({ version: 'v3', blocks: [para('c', 'Observer')] })
    })
    editor.render({ version: 'v2', blocks: [para('b', 'New')] })
    equal(received, [['v2', 'New'], ['v3', 'Observer']])
    equal(editor.save().version, 'v3')
    equal(editor.save().blocks[0].data.text, 'Observer')
  })

  test('failed replacement restores both version and blocks without announcing success', () => {
    class Rejecting extends Paragraph {
      save(element) {
        if (element.textContent === 'Reject') throw new Error('deliberate save failure')
        return super.save(element)
      }
    }
    const editor = make([para('a', 'Old')], { plugins: [new Rejecting()] })
    let changes = 0
    editor.events.on('editor:changed', () => changes++)
    let error
    try { editor.render({ version: 'v2', blocks: [para('b', 'Reject')] }) } catch (cause) { error = cause }
    assert(error instanceof Error, 'replacement must propagate its persistence failure')
    equal([editor.save().version, editor.save().blocks[0].data.text], ['1', 'Old'])
    equal(changes, 0)
    equal(editor.canUndo, false)
  })
}
