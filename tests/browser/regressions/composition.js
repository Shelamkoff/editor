import { List } from '../../../plugins/list/index.js'
import { test, make, para, key, select, assert, equal, texts } from './harness.js'

export function register() {
  test('composition Enter and legacy IME key events do not split a paragraph', () => {
    const editor = make([para('a', 'abcd')])
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 2)
    for (const options of [{ isComposing: true }, { keyCode: 229 }]) {
      const event = key(p, 'Enter', options)
      equal(event.defaultPrevented, false, 'native composition must remain available')
      equal(texts(editor), ['abcd'])
    }
    equal(editor.canUndo, false)
  })
  test('composition lifecycle shields plugin handlers and resumes after completion', () => {
    const editor = make([{ id: 'list', type: 'list', data: { style: 'unordered', items: ['one'] } }], { plugins: [new List()] })
    const list = editor.blocks.getBlockByIndex(0).contentElement
    const item = list.querySelector('li')
    select(item, 1)
    item.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    const before = editor.save().blocks
    const event = key(item, 'Enter')
    equal(event.defaultPrevented, false)
    equal(editor.save().blocks, before, 'plugin must not split during composition')
    item.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    key(item, 'Enter')
    assert(editor.save().blocks[0].data.items.length === 2, 'ordinary Enter must resume')
  })
  test('composition does not consume selected blocks or history shortcuts', () => {
    const editor = make([para('a', 'A'), para('b', 'B')])
    editor.blocks.insert('paragraph', { text: 'C' })
    editor.blocks.selectBlocks(['a', 'b'])
    const p = editor.blocks.getBlockByIndex(0).contentElement
    const before = editor.save().blocks
    for (const [name, options] of [['Delete', {}], ['Backspace', {}], ['z', { ctrlKey: true, code: 'KeyZ' }]]) {
      equal(key(p, name, { isComposing: true, ...options }).defaultPrevented, false)
      equal(editor.save().blocks, before)
    }
    equal(editor.blocks.getSelectedBlocks().map(block => block.id), ['a', 'b'])
  })
  test('composition state is scoped to one editor and released on mode changes', () => {
    const first = make([para('a', 'ab')])
    const second = make([para('b', 'cd')])
    const p = first.blocks.getBlockByIndex(0).contentElement
    select(p, 1)
    p.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    const q = second.blocks.getBlockByIndex(0).contentElement
    select(q, 1)
    key(q, 'Enter')
    equal(texts(second), ['c', 'd'])
    first.setReadOnly(true)
    first.setReadOnly(false)
    const next = first.blocks.getBlockByIndex(0).contentElement
    select(next, 1)
    key(next, 'Enter')
    equal(texts(first), ['a', 'b'])
  })
}
