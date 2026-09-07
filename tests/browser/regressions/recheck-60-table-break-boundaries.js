import { Paragraph, Table } from '../../../plugins/index.js'
import { test, make, para, select, key, assert, equal } from './harness.js'

function range(start, x, end, y) {
  start.focus()
  const r = document.createRange()
  r.setStart(start.firstChild ?? start, x); r.setEnd(end.firstChild ?? end, y)
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
}
function send(cell, mode) {
  if (mode === 'Enter' || mode === 'Shift+Enter') return key(cell, 'Enter', { shiftKey: mode === 'Shift+Enter' })
  const event = new InputEvent('beforeinput', { inputType: mode, bubbles: true, cancelable: true })
  cell.dispatchEvent(event); return event
}
export function register() {
  for (const mode of ['Enter', 'Shift+Enter', 'insertParagraph', 'insertLineBreak']) {
    for (const endpoint of ['other-cell', 'other-row', 'outside-editor']) {
      test(`Table ${mode} refuses ${endpoint} before mutating either document`, () => {
        const data = { content: [['Alpha', 'Middle', 'Bravo'], ['Next', 'Safe', 'Tail']], withHeadings: false }
        const editor = make([{ id: 't', type: 'table', data, revision: 'v1' }], { plugins: [new Paragraph(), new Table()] })
        const other = make([para('ext', 'External')])
        const table = editor.blocks.getBlockById('t').contentElement.querySelector('table')
        const cells = table.querySelectorAll('td')
        const outside = other.blocks.getBlockById('ext').contentElement
        range(cells[0], 2, endpoint === 'other-cell' ? cells[2] : endpoint === 'other-row' ? cells[5] : outside, 3)
        const before = table.innerHTML
        const event = send(cells[0], mode)
        equal(event.defaultPrevented, true, 'native Range deletion must be cancelled too')
        equal(table.innerHTML, before)
        equal(editor.save().blocks[0].data, data)
        equal(editor.save().blocks[0].revision, 'v1')
        equal(outside.textContent, 'External'); equal(other.save().blocks[0].data.text, 'External')
        equal(editor.canUndo, false); equal(other.canUndo, false)
      })
    }
    test(`Table ${mode} replaces only selected text within a cell and is undoable`, () => {
      const data = { content: [['Alpha', 'Safe']], withHeadings: false }
      const editor = make([{ id: 't', type: 'table', data }], { plugins: [new Paragraph(), new Table()] })
      const cell = editor.blocks.getBlockById('t').contentElement.querySelector('td')
      select(cell, 2, 4); equal(send(cell, mode).defaultPrevented, true)
      equal(editor.save().blocks[0].data.content, [['Al<br>a', 'Safe']])
      editor.undo(); equal(editor.save().blocks[0].data, data); equal(editor.canUndo, false)
      editor.redo(); equal(editor.save().blocks[0].data.content, [['Al<br>a', 'Safe']])
    })
  }
  test('Table Enter at a wrapper boundary does not put a BR between cells', () => {
    const editor = make([{ id: 't', type: 'table', data: { content: [['A', 'B']], withHeadings: false } }], { plugins: [new Paragraph(), new Table()] })
    const table = editor.blocks.getBlockById('t').contentElement.querySelector('table')
    table.querySelector('td').focus()
    const wrapperRange = document.createRange()
    wrapperRange.setStart(table.rows[0], 1); wrapperRange.collapse(true)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(wrapperRange)
    key(table.querySelector('td'), 'Enter')
    equal(table.rows[0].children.length, 2)
    assert([...table.rows[0].children].every(node => node.tagName === 'TD'))
    equal(editor.canUndo, false)
  })
}

export function registerNative() {
  for (const endpoint of ['same-cell', 'other-cell', 'outside-editor']) {
    test(`native Table Enter confines its mutation: ${endpoint}`, async () => {
      const data = { content: [['Alpha', 'Middle', 'Bravo'], ['Next', 'Safe', 'Tail']], withHeadings: false }
      const editor = make([{ id: 't', type: 'table', data }], { plugins: [new Paragraph(), new Table()] })
      const other = make([para('ext', 'External')])
      const cells = editor.blocks.getBlockById('t').contentElement.querySelectorAll('td')
      const outside = other.blocks.getBlockById('ext').contentElement
      range(cells[0], 2, endpoint === 'same-cell' ? cells[0] : endpoint === 'other-cell' ? cells[2] : outside, endpoint === 'same-cell' ? 2 : 3)
      let keys = 0
      cells[0].addEventListener('keydown', () => keys++, { once: true })
      const params = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }
      await window.__testInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params })
      await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
      equal(keys, 1)
      equal(editor.save().blocks[0].data.content, endpoint === 'same-cell'
        ? [['Al<br>pha', 'Middle', 'Bravo'], ['Next', 'Safe', 'Tail']] : data.content)
      equal(outside.textContent, 'External'); equal(other.save().blocks[0].data.text, 'External')
    })
  }
}
