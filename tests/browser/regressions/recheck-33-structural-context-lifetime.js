import { Paragraph, Heading } from '../../../plugins/index.js'
import { test, make, para, select, equal, texts } from './harness.js'

function tracked() {
  const contexts = []
  class Tracked extends Paragraph {
    type = 'tracked'
    render(data, context) { contexts.push(context); return super.render(data, context) }
  }
  return { contexts, plugin: new Tracked() }
}

export function register() {
  for (const retire of ['remove', 'convert', 'render', 'readOnly']) {
    for (const operation of ['splitBlock', 'exitEmptyBlock']) {
      test(`${operation} from a context retired by ${retire} cannot edit another live block`, () => {
        const { contexts, plugin } = tracked()
        const editor = make([{ id: 'old', type: 'tracked', data: { text: 'Old' } }, para('target', 'AB')], { plugins: [new Paragraph(), new Heading(), plugin] })
        const stale = contexts[0]
        if (retire === 'remove') editor.blocks.remove(0)
        if (retire === 'convert') editor.blocks.convert(0, 'paragraph')
        if (retire === 'render') editor.render({ version: 'next', blocks: [para('old', 'Replacement'), para('target', 'AB')] })
        if (retire === 'readOnly') { editor.setReadOnly(true); editor.setReadOnly(false) }
        if (operation === 'exitEmptyBlock') editor.blocks.convert(editor.blocks.getBlockIndex('target'), 'heading', { text: '', level: 3 })
        const target = editor.blocks.getBlockById('target').contentElement
        select(target, operation === 'splitBlock' ? 1 : 0)
        const before = editor.save().blocks
        stale[operation]()
        equal(editor.save().blocks, before)
      })
    }
  }
  test('live structural context still splits its active block and can be undone', () => {
    const { contexts, plugin } = tracked()
    const editor = make([{ id: 'a', type: 'tracked', data: { text: 'AB' } }], { plugins: [new Paragraph(), plugin] })
    select(editor.blocks.getBlockById('a').contentElement, 1)
    contexts[0].splitBlock()
    equal(texts(editor), ['A', 'B'])
    editor.undo(); equal(texts(editor), ['AB'])
  })
  test('live structural context still exits an empty non-default block', () => {
    const { contexts, plugin } = tracked()
    const editor = make([{ id: 'a', type: 'tracked', data: { text: '' } }], { plugins: [new Paragraph(), plugin] })
    select(editor.blocks.getBlockById('a').contentElement, 0)
    equal(contexts[0].exitEmptyBlock(), true)
    equal(editor.save().blocks.map(block => block.type), ['paragraph'])
  })
  test('all retained context mutations are inert after editor destruction', () => {
    const { contexts, plugin } = tracked()
    const editor = make([{ id: 'a', type: 'tracked', data: { text: 'A' } }], { plugins: [new Paragraph(), plugin] })
    const stale = contexts[0]
    editor.destroy()
    const before = contexts.length
    let ran = false
    stale.splitBlock()
    equal(stale.exitEmptyBlock(), false)
    stale.mutate(() => { ran = true })
    equal(ran, false)
    equal(contexts.length, before)
  })
}
