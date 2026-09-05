import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, assert, equal } from './harness.js'

export function register() {
  test('retained block API cannot recreate resources after editor destruction', () => {
    let renders = 0
    class Tracked extends Paragraph {
      render(data) { renders++; return super.render(data) }
    }
    const editor = make(undefined, { plugins: [new Tracked()] })
    const blocks = editor.blocks
    editor.destroy()
    const before = renders
    let error
    try { blocks.insert('paragraph', { text: 'late' }) } catch (cause) { error = cause }
    assert(error instanceof Error, 'retained insert must reject a destroyed editor')
    equal(renders, before, 'destroyed API must not call plugin.render')
  })
  test('retained readers, block views and event subscriptions respect editor lifetime', () => {
    const editor = make()
    const blocks = editor.blocks
    const block = blocks.getBlockByIndex(0)
    const events = editor.events
    const unsubscribe = events.on('editor:changed', () => {})
    editor.destroy()
    for (const operation of [
      () => blocks.getBlockCount(),
      () => blocks.selectBlocks(['a']),
      () => block.focus(),
      () => block.contentElement,
      () => events.on('editor:changed', () => {}),
      () => events.once('editor:changed', () => {}),
    ]) {
      let error
      try { operation() } catch (cause) { error = cause }
      assert(error instanceof Error, 'retained API must reject after destroy')
    }
    unsubscribe()
    editor.destroy()
  })
}
