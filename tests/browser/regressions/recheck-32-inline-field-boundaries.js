import { Paragraph, Quote, Table } from '../../../plugins/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { selectNative } from './conversion-fixture.js'
import { test, make, para, select, equal, pause } from './harness.js'

export function register() {
  for (const position of ['cross-fields', 'wrapper']) {
    test(`inline insertion refuses ${position} before changing document data or revision`, async () => {
      let changes = 0
      const editor = make([{ id: 'q', type: 'quote', data: { text: 'Quote', caption: 'Caption' }, revision: 'v1' }], {
        plugins: [new Paragraph(), new Quote()], inlinePlugins: [createColorSwatchPlugin()],
        onChange: () => changes++, tuning: { change: { debounceMs: 0 } },
      })
      const root = editor.blocks.getBlockById('q').contentElement
      if (position === 'cross-fields') selectNative(root.querySelector('blockquote'), 2, root.querySelector('cite'), 3)
      else {
        const range = document.createRange(); range.setStart(root, 1); range.collapse(true)
        window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
      }
      const before = editor.save().blocks
      equal(editor.insertInlinePlugin('color', { value: '#ff0000' }), false)
      equal(editor.save().blocks, before)
      equal(root.querySelector('[data-inline-plugin]'), null)
      equal(editor.canUndo, false)
      await pause(20)
      equal(changes, 0)
    })
  }
  test('inline insertion cannot nest a new widget inside a noneditable existing widget', () => {
    const editor = make([para('a', 'A{{w}}B', { inline: { w: { type: 'color', data: { value: '#00ff00' } } } })], { inlinePlugins: [createColorSwatchPlugin()] })
    const widget = editor.blocks.getBlockById('a').contentElement.querySelector('[data-inline-plugin]')
    const range = document.createRange(); range.selectNodeContents(widget); range.collapse(true)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    const before = editor.save().blocks
    equal(editor.insertInlinePlugin('color', { value: '#ff0000' }), false)
    equal(editor.save().blocks, before)
  })
  for (const target of ['caption', 'empty-cell']) {
    test(`inline insertion in a valid ${target} survives save, undo and redo`, () => {
      const editor = make(target === 'caption'
        ? [{ id: 'q', type: 'quote', data: { text: 'KEEP', caption: 'Caption' } }]
        : [{ id: 't', type: 'table', data: { withHeadings: false, content: [['A', '']] } }], {
        plugins: [new Paragraph(), new Quote(), new Table()], inlinePlugins: [createColorSwatchPlugin()],
      })
      const root = editor.blocks.getBlockByIndex(0).contentElement
      const field = target === 'caption' ? root.querySelector('cite') : root.querySelectorAll('td')[1]
      select(field, target === 'caption' ? 3 : 0)
      const before = editor.save().blocks
      equal(editor.insertInlinePlugin('color', { value: '#ff0000' }), true)
      const saved = editor.save().blocks
      equal(Object.values(saved[0].inline), [{ type: 'color', data: { value: '#ff0000' } }])
      if (target === 'caption') equal(saved[0].data.text, 'KEEP')
      else equal(saved[0].data.content[0][0], 'A')
      editor.undo(); equal(editor.save().blocks, before)
      editor.redo(); equal(editor.save().blocks, saved)
    })
  }
  test('fresh-insertion hooks are not called for a range outside one authored field', () => {
    let calls = 0
    const fresh = {
      type: 'fresh', title: 'Fresh', icon: '', createWidget: () => document.createElement('span'),
      hydrate() {}, getData: () => ({}),
      insertFresh() { calls++; window.getSelection().getRangeAt(0).insertNode(document.createTextNode('@')) },
    }
    const editor = make([{ id: 'q', type: 'quote', data: { text: 'Quote', caption: 'Caption' } }], {
      plugins: [new Paragraph(), new Quote()], inlinePlugins: [fresh],
    })
    const root = editor.blocks.getBlockById('q').contentElement
    selectNative(root.querySelector('blockquote'), 2, root.querySelector('cite'), 3)
    equal(editor.insertInlinePlugin('fresh'), false)
    equal(calls, 0)
    select(root.querySelector('cite'), 0)
    equal(editor.insertInlinePlugin('fresh'), true)
    equal(calls, 1)
    equal(editor.save().blocks[0].data.caption, '@Caption')
  })
  test('cross-block inline insertion does not delete or merge either block', () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { inlinePlugins: [createColorSwatchPlugin()] })
    selectNative(editor.blocks.getBlockById('a').contentElement, 2, editor.blocks.getBlockById('b').contentElement, 3)
    const before = editor.save().blocks
    equal(editor.insertInlinePlugin('color', { value: '#ff0000' }), false)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}
