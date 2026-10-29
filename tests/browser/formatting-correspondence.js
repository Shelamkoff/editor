import { InlineSelectionAuthority } from '../../core/InlineSelectionAuthority.js'
import { projectRichTextCaretPadding } from '../../shared/richTextCaretPadding.js'
import { test, assert, equal, run } from './regressions/harness.js'

// The boundary under test receives genuine browser Nodes and Ranges. Its
// logical points are independent fixtures, never copied from the codec output.
function fixture(html = 'Alpha', anchor = 0, focus = 5) {
  const root = document.createElement('section')
  const block = document.createElement('article')
  let field = document.createElement('p')
  field.contentEditable = 'true'
  field.innerHTML = html
  block.append(field)
  root.append(block)
  document.body.append(root)
  const runtime = { generation: 1, revision: 1, health: 'ready', readOnly: false,
    indexOf: id => id === 'block' ? 0 : -1,
    prepareExtensionValue: callback => callback() }
  const reconciler = {
    getElement: id => id === 'block' ? block : null,
    getEditableField: (id, key) => id === 'block' && key === 'text'
      ? { key, mode: 'rich-text', element: field } : null,
    getEditableFields: id => id === 'block' ? [{ key: 'text', mode: 'rich-text', element: field }] : [],
  }
  let range = document.createRange()
  range.selectNodeContents(field)
  let mutating = false
  const restored = []
  const bookmark = { anchor: { blockId: 'block', fieldKey: 'text', offset: anchor },
    focus: { blockId: 'block', fieldKey: 'text', offset: focus } }
  const port = new InlineSelectionAuthority({ root, runtime, reconciler,
    readSelection: () => ({ range, bookmark }),
    restoreSelection: value => { restored.push(value); return true },
    lease: () => 1, isMutating: () => mutating,
  })
  port.activate()
  return { root, block, get field() { return field }, port, restored, bookmark, runtime,
    setMutation(value) { mutating = value },
    setRange(value) { range = value },
    replaceField() {
      const next = field.cloneNode(true)
      field.replaceWith(next)
      field = next
      range = document.createRange()
      range.selectNodeContents(field)
    },
    destroy() { port.revoke(); root.remove() },
  }
}

for (const backward of [false, true]) {
  for (const html of ['Alpha', '<b>Alpha</b>', '<i></i><b>Alpha</b><span></span>']) {
    test(`logical ${backward ? 'backward' : 'forward'} correspondence accepts parent/empty-wrapper boundaries: ${html}`, () => {
      const h = fixture(html, backward ? 5 : 0, backward ? 0 : 5)
      try {
        const native = document.createRange()
        native.selectNodeContents(h.field)
        const text = document.createTreeWalker(h.field, NodeFilter.SHOW_TEXT).nextNode()
        const alternative = document.createRange()
        alternative.setStart(text, 0); alternative.setEnd(text, 5)
        assert(native.compareBoundaryPoints(Range.START_TO_START, alternative) !== 0,
          'fixture did not exercise structurally different boundary points')
        const token = h.port.capture(alternative)
        assert(token, 'equivalent logical endpoints were rejected')
        assert(h.port.restore(token))
        equal(h.restored, [h.bookmark])
        const view = h.port.range
        assert(view instanceof Range && view !== h.port.range, 'range view is not fresh')
      } finally { h.destroy() }
    })
  }
}

test('equal selected text in a different interval cannot mint or restore a token', () => {
  const h = fixture('ABCABC', 0, 3)
  try {
    const first = document.createRange()
    first.setStart(h.field.firstChild, 0); first.setEnd(h.field.firstChild, 3)
    h.setRange(first)
    const token = h.port.capture()
    assert(token)
    const second = document.createRange()
    second.setStart(h.field.firstChild, 3); second.setEnd(h.field.firstChild, 6)
    equal(second.toString(), first.toString())
    equal(h.port.capture(second), null)
    h.setRange(second) // No selectionchange is delivered before this check.
    equal(h.port.restore(token), false)
    equal(h.restored, [])
  } finally { h.destroy() }
})

for (const element of [
  '<button>Label</button>', '<span role="button">Label</span>',
  '<span contenteditable="false">Label</span>', '<span contenteditable="true">Label</span>',
  '<span contenteditable="plaintext-only">Label</span>',
  '<span data-inline-plugin="custom">Label</span>',
]) {
  test(`a protected descendant cannot borrow a numerically coincident field offset: ${element}`, () => {
    const h = fixture(`A${element}BC`, 1, 3)
    try {
      const range = document.createRange()
      range.setStart(h.field.children[0].firstChild, 0)
      range.setEnd(h.field.lastChild, 2)
      h.setRange(range)
      equal(h.port.capture(), null)
      equal(h.port.range, null)
      equal(h.restored, [])
    } finally { h.destroy() }
  })
}

test('external boundaries can enclose a complete atomic widget and line break', () => {
  const h = fixture('A<span data-inline-plugin="custom" contenteditable="false">Long widget label</span>B<br>C', 0, 5)
  try {
    assert(h.port.capture(), 'whole atomic content between eligible endpoints was rejected')
    assert(h.port.restore(h.port.capture()))
    equal(h.restored, [h.bookmark])
  } finally { h.destroy() }
})

test('padding-node endpoints cannot masquerade as authored line-break positions', () => {
  const h = fixture('A<br>', 0, 2)
  try {
    projectRichTextCaretPadding(h.field)
    const pad = h.field.querySelector('[data-oe-caret-padding]')
    assert(pad)
    const valid = document.createRange()
    valid.selectNodeContents(h.field)
    h.setRange(valid)
    assert(h.port.capture(), 'an outside boundary around padding lost the authored line break')
    const invalid = valid.cloneRange()
    invalid.setEnd(pad, 0)
    equal(h.port.capture(invalid), null)
  } finally { h.destroy() }
})

for (const css of ['display:none', 'visibility:hidden']) {
  test(`hidden endpoints are ineligible even when their text has matching offsets: ${css}`, () => {
    const h = fixture(`<span style="${css}">Alpha</span>`, 0, 5)
    try {
      const range = document.createRange()
      range.selectNodeContents(h.field.firstChild)
      h.setRange(range)
      equal(h.port.capture(), null)
      equal(h.port.range, null)
    } finally { h.destroy() }
  })
}

test('a same-key field replacement retires old rights but accepts a fresh capture', () => {
  const h = fixture()
  try {
    const token = h.port.capture()
    assert(token)
    h.replaceField()
    let reads = 0
    equal(h.port.restore(token, { get endOffsetDelta() { reads++; return 0 } }), false)
    equal(reads, 0)
    equal(h.port.isValid(token), false)
    assert(h.port.capture())
    equal(h.restored, [])
  } finally { h.destroy() }
})

test('foreign-document nodes cannot acquire an owning-editor formatting token', () => {
  const h = fixture()
  const foreign = document.implementation.createHTMLDocument('foreign')
  try {
    const field = foreign.createElement('p')
    field.textContent = 'Alpha'
    foreign.body.append(field)
    const range = foreign.createRange()
    range.selectNodeContents(field)
    equal(h.port.capture(range), null)
    equal(h.restored, [])
  } finally { h.destroy() }
})

test('one protected wrapper edit may restore original logical points but not a replaced field', () => {
  const h = fixture('<b>Alpha</b>', 1, 4)
  try {
    const range = document.createRange()
    range.setStart(h.field.firstChild.firstChild, 1)
    range.setEnd(h.field.firstChild.firstChild, 4)
    h.setRange(range)
    const token = h.port.capture()
    assert(token)
    h.setMutation(true)
    h.field.firstChild.replaceWith(...h.field.firstChild.childNodes)
    assert(h.port.restore(token))
    equal(h.restored, [h.bookmark])
    h.replaceField()
    equal(h.port.restore(token), false)
    equal(h.restored.length, 1)
  } finally { h.destroy() }
})

test('logical formatting offsets cannot split a surrogate pair across wrappers', () => {
  const h = fixture('', 0, 2)
  try {
    const left = document.createTextNode('A\uD83D')
    const span = document.createElement('span')
    span.append(document.createTextNode('\uDE00B'))
    h.field.append(left, span)
    const invalid = document.createRange()
    invalid.setStart(left, 0); invalid.setEnd(left, 2)
    h.setRange(invalid)
    equal(h.port.capture(), null)
    h.bookmark.anchor.offset = 1
    h.bookmark.focus.offset = 3
    const valid = document.createRange()
    valid.setStart(left, 1); valid.setEnd(span.firstChild, 1)
    h.setRange(valid)
    assert(h.port.capture(), 'whole Unicode character across wrappers must remain eligible')
  } finally { h.destroy() }
})

await run()
