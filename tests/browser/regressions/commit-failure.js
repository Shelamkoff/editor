import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, equal, assert, texts } from './harness.js'

export function register() {
  test('a new block whose save fails makes insert fail and rolls back', () => {
    const broken = {
      type: 'broken', title: 'Broken', icon: '',
      render() { return document.createElement('p') },
      save() { throw new Error('injected save failure') },
    }
    const editor = make(undefined, { plugins: [new Paragraph(), broken] })
    let error
    try { editor.blocks.insert('broken') } catch (cause) { error = cause }
    assert(error, 'insert must report failure to its caller')
    equal(texts(editor), ['A'])
    equal(editor.canUndo, false)
  })
  test('strict validation failure rolls back DOM mutation before change is published', () => {
    let mutate
    class Validated extends Paragraph {
      render(data, context) { mutate = context.mutate; return super.render(data) }
      validate(data) { return !data.text.includes('!') }
    }
    const editor = make(undefined, { plugins: [new Validated()], validationMode: 'strict' })
    let changes = 0
    editor.events.on('editor:changed', () => { changes++ })
    let failed = false
    try { mutate(() => { editor.blocks.getBlockByIndex(0).contentElement.textContent = 'invalid!' }) }
    catch { failed = true }
    equal(failed, true)
    equal(texts(editor), ['A'])
    equal(changes, 0)
    equal(editor.canUndo, false)
  })
}
