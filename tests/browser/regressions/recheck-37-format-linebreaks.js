import { test, make, para, key, equal, assert } from './harness.js'

function glyphs(field, tag) {
  const result = []
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    for (const char of walker.currentNode.data) result.push([char, !!walker.currentNode.parentElement.closest(tag)])
  }
  return result
}

export function register() {
  for (const [tool, tag, shortcut] of [['bold', 'b', 'b'], ['italic', 'i', 'i']]) {
    for (const side of ['before', 'after']) {
      test(`${tool}: removing formatting preserves an unselected ${side} line break`, () => {
        const html = side === 'before' ? `<${tag}><br>AB</${tag}>C` : `<${tag}>AB<br></${tag}>C`
        const editor = make([para('a', html)], { inlineTools: [tool] })
        const field = editor.blocks.getBlockByIndex(0).contentElement
        field.focus()
        const text = [...field.querySelector(tag).childNodes].find(node => node.nodeType === Node.TEXT_NODE)
        const range = document.createRange()
        range.setStart(text, side === 'before' ? 0 : 1); range.setEnd(text, 2)
        window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
        key(field, shortcut, { ctrlKey: true, code: `Key${shortcut.toUpperCase()}` })
        const result = editor.save().blocks[0].data.text
        assert(result.includes('<br>'), 'authored break outside selection must survive')
        equal(field.textContent, 'ABC')
        equal(glyphs(field, tag), [['A', side === 'after'], ['B', false], ['C', false]], 'the selected text must actually lose formatting')
        equal(window.getSelection().toString(), side === 'before' ? 'AB' : 'B')
        editor.undo(); equal(editor.save().blocks[0].data.text, html)
        editor.redo(); equal(editor.save().blocks[0].data.text, result)
      })
    }
  }
  test('formatting across nested wrappers keeps non-text suffixes and their order', () => {
    const editor = make([para('a', '<b><i>AB<br></i></b>C')], { inlineTools: ['bold'] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    field.focus()
    const text = field.querySelector('i').firstChild
    const range = document.createRange(); range.setStart(text, 1); range.setEnd(text, 2)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    key(field, 'b', { ctrlKey: true, code: 'KeyB' })
    assert(field.querySelector('br'), 'nested unselected break must survive')
    equal(glyphs(field, 'b'), [['A', true], ['B', false], ['C', false]])
    equal(glyphs(field, 'i'), [['A', true], ['B', true], ['C', false]], 'unrelated italic remains')
    equal(field.innerText.replace(/\n+/g, '\n'), 'AB\nC')
    equal(window.getSelection().toString(), 'B')
  })
}
