import { Paragraph, Table, Quote } from '../../../plugins/index.js'
import { test, make, para, select, key, paste, equal, assert } from './harness.js'

function insertAtField(field, prefix, text = 'X') {
  const range = window.getSelection().getRangeAt(0)
  assert(field.contains(range.startContainer), 'caret must belong to the requested edge field')
  assert(document.activeElement === field, 'the same field must own browser focus')
  const before = document.createRange(); before.selectNodeContents(field); before.setEnd(range.startContainer, range.startOffset)
  equal(before.toString(), prefix, 'caret must be at the intended edge')
  assert(document.execCommand('insertText', false, text), 'browser text input must execute')
}
function openSettings(editor) {
  editor.rootElement.querySelector('.oe-toolbar__drag').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: 10, clientY: 10 }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 10, clientY: 10 }))
}

export function register() {
  for (const direction of ['start', 'end']) {
    for (const empty of [false, true]) {
      test(`navigation focuses the ${empty ? 'empty' : 'populated'} ${direction} table field before restoring the caret`, () => {
        const row = direction === 'end' ? ['A', empty ? '' : 'B'] : [empty ? '' : 'A', 'B']
        const editor = make([para('before', 'Before'), { id: 't', type: 'table', data: { withHeadings: false, content: [row] } }, para('after', 'After')], { plugins: [new Paragraph(), new Table()] })
        const p = editor.blocks.getBlockById(direction === 'end' ? 'after' : 'before').contentElement
        select(p, direction === 'end' ? 0 : p.textContent.length)
        key(p, direction === 'end' ? 'ArrowUp' : 'ArrowDown')
        const cells = editor.blocks.getBlockById('t').contentElement.querySelectorAll('td')
        insertAtField(cells[direction === 'end' ? 1 : 0], direction === 'end' ? row[1] : '')
        equal(editor.save().blocks[1].data.content, [direction === 'end' ? ['A', empty ? 'X' : 'BX'] : [empty ? 'X' : 'XA', 'B']])
        editor.undo(); equal(editor.save().blocks[1].data.content, [row])
      })
    }
  }
  for (const caption of ['', 'Author']) {
    test(`ArrowUp into Quote selects its ${caption ? 'populated' : 'empty'} caption end`, () => {
      const editor = make([{ id: 'q', type: 'quote', data: { text: 'KEEP', caption } }, para('p', 'After')], { plugins: [new Paragraph(), new Quote()] })
      const p = editor.blocks.getBlockById('p').contentElement
      select(p, 0); key(p, 'ArrowUp')
      insertAtField(editor.blocks.getBlockById('q').contentElement.querySelector('cite'), caption)
      equal(editor.save().blocks[0].data, { text: 'KEEP', caption: caption + 'X' })
    })
  }
  test('removing an empty following paragraph puts the caret in the preceding last cell', () => {
    const editor = make([{ id: 't', type: 'table', data: { withHeadings: false, content: [['A', '']] } }, para('p', '')], { plugins: [new Paragraph(), new Table()] })
    const p = editor.blocks.getBlockById('p').contentElement
    select(p, 0); key(p, 'Backspace')
    insertAtField(editor.blocks.getBlockById('t').contentElement.querySelectorAll('td')[1], '')
    equal(editor.save().blocks[0].data.content, [['A', 'X']])
  })
  test('internal paste focuses the final field of a newly inserted table', async () => {
    const editor = make([para('p', 'Before')], { plugins: [new Paragraph(), new Table()] })
    const p = editor.blocks.getBlockById('p').contentElement
    select(p, p.textContent.length)
    await paste(p, { 'application/x-rector-editor': JSON.stringify([{ type: 'table', data: { withHeadings: false, content: [['A', 'B']] } }]) })
    insertAtField(editor.blocks.getBlockByIndex(1).contentElement.querySelectorAll('td')[1], 'B')
    equal(editor.save().blocks[1].data.content, [['A', 'BX']])
  })
  test('Duplicate retains end-of-block focus in the last field of its new table', () => {
    const editor = make([{ id: 't', type: 'table', data: { withHeadings: false, content: [['A', 'B']] } }], { plugins: [new Paragraph(), new Table()] })
    select(editor.blocks.getBlockById('t').contentElement.querySelector('td'), 0)
    openSettings(editor)
    const label = [...editor.rootElement.querySelectorAll('.oe-settings-menu__label')].find(item => item.textContent === 'Duplicate')
    assert(label, 'duplicate action must be available'); label.closest('li').click()
    insertAtField(editor.blocks.getBlockByIndex(1).contentElement.querySelectorAll('td')[1], 'B')
    equal(editor.save().blocks[1].data.content, [['A', 'BX']])
  })
  test('navigation to a paragraph still inserts after its existing text', () => {
    const editor = make([para('a', 'A'), para('p', 'After')])
    select(editor.blocks.getBlockById('p').contentElement, 0)
    key(editor.blocks.getBlockById('p').contentElement, 'ArrowUp')
    insertAtField(editor.blocks.getBlockById('a').contentElement, 'A')
    equal(editor.save().blocks[0].data.text, 'AX')
  })
}
