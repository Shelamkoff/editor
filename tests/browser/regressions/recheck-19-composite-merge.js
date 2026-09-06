import { Paragraph, Quote, Warning, Toggle, Spoiler } from '../../../plugins/index.js'
import { test, make, select, key, equal, assert } from './harness.js'

const cases = [
  [Quote, 'quote', { text: 'Left', caption: 'Author A' }, { text: 'Right', caption: 'Author B' }, { text: 'LeftRight', caption: 'Author A<br>Author B' }],
  [Warning, 'warning', { title: 'Title A', message: 'Body A' }, { title: 'Title B', message: 'Body B' }, { title: 'Title A<br>Title B', message: 'Body A<br>Body B' }],
  [Toggle, 'toggle', { title: 'Title A', content: 'Body A', open: true }, { title: 'Title B', content: 'Body B', open: true }, { title: 'Title A<br>Title B', content: 'Body A<br>Body B', open: true }],
  [Spoiler, 'spoiler', { label: 'Label A', content: 'Body A' }, { label: 'Label B', content: 'Body B' }, { label: 'Label A<br>Label B', content: 'Body A<br>Body B' }],
]

function boundary(editor, action) {
  const root = editor.blocks.getBlockByIndex(action === 'Backspace' ? 1 : 0).contentElement
  const fields = root.querySelectorAll('[contenteditable="true"]')
  const field = action === 'Backspace' ? fields[0] : fields[fields.length - 1]
  field.focus()
  const range = document.createRange()
  range.selectNodeContents(field)
  range.collapse(action === 'Backspace')
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(range)
  return field
}

export function register() {
  for (const [Plugin, type, left, right, expected] of cases) {
    for (const action of ['Backspace', 'Delete']) {
      test(`${action} merges every authored ${type} field and roundtrips through history`, () => {
        const editor = make([{ id: 'a', type, data: left }, { id: 'b', type, data: right }], { plugins: [new Paragraph(), new Plugin()] })
        const before = editor.save().blocks
        assert(key(boundary(editor, action), action).defaultPrevented)
        equal(editor.save().blocks.map(block => block.data), [expected])
        editor.undo()
        equal(editor.save().blocks, before)
        editor.redo()
        equal(editor.save().blocks.map(block => block.data), [expected])
      })
    }
    test(`${type} merge preserves live handlers and rich markup in the destination`, () => {
      const editor = make([{ id: 'a', type, data: left }, { id: 'b', type, data: right }], { plugins: [new Paragraph(), new Plugin()] })
      const field = editor.blocks.getBlockByIndex(0).contentElement.querySelector('[contenteditable="true"]')
      const marker = document.createElement('strong')
      marker.textContent = 'Live'
      let clicks = 0
      marker.addEventListener('click', () => clicks++)
      field.appendChild(marker)
      field.dispatchEvent(new InputEvent('input', { bubbles: true }))
      key(boundary(editor, 'Backspace'), 'Backspace')
      assert(field.contains(marker), 'merging must not recreate the existing rich DOM')
      marker.click()
      equal(clicks, 1)
    })
  }

  test('a Quote merge retains a caption when its incoming body is empty', () => {
    const editor = make([
      { id: 'a', type: 'quote', data: { text: 'Text', caption: '' } },
      { id: 'b', type: 'quote', data: { text: '', caption: 'Only author' } },
    ], { plugins: [new Paragraph(), new Quote()] })
    key(boundary(editor, 'Backspace'), 'Backspace')
    equal(editor.save().blocks.map(block => block.data), [{ text: 'Text', caption: 'Only author' }])
  })

  test('Warning merge carries unresolved widgets from both incoming fields', () => {
    const inline = { w_title: { type: 'missing', data: { value: 'title' } }, w_body: { type: 'missing', data: { value: 'body' } } }
    const editor = make([
      { id: 'a', type: 'warning', data: { title: 'A', message: 'B' } },
      { id: 'b', type: 'warning', data: { title: '{{w_title}}', message: '{{w_body}}' }, inline },
    ], { plugins: [new Paragraph(), new Warning()] })
    key(boundary(editor, 'Backspace'), 'Backspace')
    const saved = editor.save().blocks
    equal(saved.length, 1)
    equal(saved[0].data, { title: 'A<br>{{w_title}}', message: 'B<br>{{w_body}}' })
    equal(saved[0].inline, inline)
  })
}
