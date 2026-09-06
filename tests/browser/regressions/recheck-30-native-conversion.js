import { Paragraph, Heading } from '../../../plugins/index.js'
import { test, make, para, equal, assert, texts, select } from './harness.js'
import { convertSelection, selectNative } from './conversion-fixture.js'

function settingsConvert(editor) {
  const button = editor.rootElement.querySelector('.oe-toolbar__drag')
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: 10, clientY: 10 }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 10, clientY: 10 }))
  const arrow = editor.rootElement.querySelector('.oe-settings-menu__arrow')
  assert(arrow, 'conversion must be available in the settings menu')
  arrow.closest('li').click()
  const label = [...editor.rootElement.querySelectorAll('.oe-settings-menu__label')].find(item => item.textContent === 'Heading')
  assert(label, 'heading target must be available')
  label.closest('li').click()
}

export function register() {
  for (const mode of ['forward', 'backward', 'settings']) {
    test(`${mode} native cross-block conversion consumes each selected fragment exactly once`, () => {
      const inline = { w: { type: 'missing', data: { name: 'KEEP' } } }
      const editor = make([para('a', 'Alpha'), para('b', 'Bra{{w}}vo', { inline })], { plugins: [new Paragraph(), new Heading()] })
      const before = editor.save().blocks
      const a = editor.blocks.getBlockById('a').contentElement
      const b = editor.blocks.getBlockById('b').contentElement
      selectNative(a, 2, b, 3)
      if (mode === 'backward') window.getSelection().setBaseAndExtent(b.firstChild, 3, a.firstChild, 2)
      if (mode === 'settings') settingsConvert(editor)
      else convertSelection(editor, 'heading')
      equal(texts(editor), ['Al', 'pha', 'Bra', '{{w}}vo'])
      equal(editor.save().blocks.map(block => block.type), ['paragraph', 'heading', 'heading', 'paragraph'])
      equal(editor.save().blocks[3].inline, inline)
      editor.undo()
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
      editor.redo()
      equal(texts(editor), ['Al', 'pha', 'Bra', '{{w}}vo'])
    })
  }
  for (const sameId of [false, true]) {
    test(`conversion refuses a range ending in another editor${sameId ? ' with a colliding block ID' : ''}`, () => {
      const editor = make([para('a', 'Alpha'), para('b', 'Local')], { plugins: [new Paragraph(), new Heading()] })
      const other = make([para(sameId ? 'b' : 'foreign', 'External')])
      selectNative(editor.blocks.getBlockById('a').contentElement, 2, other.blocks.getBlockByIndex(0).contentElement, 3)
      convertSelection(editor, 'heading')
      equal(texts(editor), ['Alpha', 'Local'])
      equal(texts(other), ['External'])
      equal(editor.save().blocks.map(block => block.type), ['paragraph', 'paragraph'])
      equal(editor.canUndo, false)
    })
  }
  test('native partial cross conversion rolls back every endpoint on a render error', () => {
    class Failing extends Heading { render(data) { if (data.text === 'pha') throw new Error('deliberate endpoint error'); return super.render(data) } }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { plugins: [new Paragraph(), new Failing()] })
    selectNative(editor.blocks.getBlockById('a').contentElement, 2, editor.blocks.getBlockById('b').contentElement, 3)
    convertSelection(editor, 'heading')
    equal(texts(editor), ['Alpha', 'Bravo'])
    equal(editor.save().blocks.map(block => block.type), ['paragraph', 'paragraph'])
    equal(editor.canUndo, false)
  })
  test('explicit whole-block selection is not replaced by a leftover single-field caret', () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { plugins: [new Paragraph(), new Heading()] })
    select(editor.blocks.getBlockById('a').contentElement, 2)
    editor.blocks.selectBlocks(['a', 'b'])
    convertSelection(editor, 'heading')
    equal(editor.save().blocks.map(block => block.type), ['heading', 'heading'])
    equal(texts(editor), ['Alpha', 'Bravo'])
  })
}
