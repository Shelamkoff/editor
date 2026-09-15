import { test, equal, assert } from './harness.js'
import { List, Checklist, Table, Quote, Poll } from '../../../plugins/index.js'

function mutationContext(ownerDocument) {
  return {
    ownerDocument,
    readOnly: false,
    mutate(operation) { return operation() },
    splitBlock() {},
    exitEmptyBlock() { return false },
  }
}

function withIframeRealm(run) {
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  try {
    const doc = iframe.contentDocument
    const view = iframe.contentWindow
    assert(doc && view, 'iframe realm unavailable')
    return run(doc, view)
  } finally {
    iframe.remove()
  }
}

function selectContentsEnd(doc, view, element) {
  const range = doc.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  const selection = view.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

export function register() {
  test('list editing uses the block owning selection realm', () => withIframeRealm((doc, view) => {
    const plugin = new List()
    const root = plugin.render({ items: ['Alpha'], style: 'unordered' }, mutationContext(doc))
    doc.body.appendChild(root)
    const item = root.querySelector(':scope > li')
    assert(item, 'list item missing')
    selectContentsEnd(doc, view, item)
    window.getSelection()?.removeAllRanges()

    item.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

    equal(root.querySelectorAll(':scope > li').length, 2)
  }))

  test('checklist editing uses the block owning selection realm', () => withIframeRealm((doc, view) => {
    const plugin = new Checklist()
    const root = plugin.render({ items: [{ text: 'Alpha', checked: false }] }, mutationContext(doc))
    doc.body.appendChild(root)
    const text = root.querySelector('.oe-checklist__text')
    assert(text, 'checklist text field missing')
    selectContentsEnd(doc, view, text)
    window.getSelection()?.removeAllRanges()

    text.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

    equal(root.querySelectorAll('.oe-checklist__item').length, 2)
  }))

  test('table line breaks use the table owning selection and element realm', () => withIframeRealm((doc, view) => {
    const plugin = new Table()
    const root = plugin.render({ content: [['Alpha']], withHeadings: false }, mutationContext(doc))
    doc.body.appendChild(root)
    const cell = root.querySelector('td')
    assert(cell, 'table cell missing')
    selectContentsEnd(doc, view, cell)
    window.getSelection()?.removeAllRanges()

    cell.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

    assert(cell.querySelector('br'), 'table did not insert a line break in its owning document')
  }))

  test('quote field navigation reads activeElement from the block owning document', () => withIframeRealm((doc, view) => {
    const plugin = new Quote()
    const root = plugin.render({ text: 'Alpha', caption: 'Beta' }, mutationContext(doc))
    doc.body.appendChild(root)
    const quote = root.querySelector('.oe-quote__text')
    const caption = root.querySelector('.oe-quote__caption')
    assert(quote && caption, 'quote fields missing')
    quote.focus()
    equal(doc.activeElement, quote)

    quote.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))

    equal(doc.activeElement, caption)
  }))

  test('poll option removal restores selection through the block owning window', () => withIframeRealm((doc, view) => {
    const plugin = new Poll()
    const root = plugin.render({
      question: 'Pick one',
      type: 'single',
      options: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: '' },
        { id: 'c', text: 'Charlie' },
      ],
      resultsMode: 'always',
    }, mutationContext(doc))
    doc.body.appendChild(root)
    const texts = root.querySelectorAll('.oe-poll__option-text')
    const middle = texts[1]
    assert(middle, 'poll option text missing')
    const range = doc.createRange()
    range.setStart(middle, 0)
    range.collapse(true)
    const selection = view.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    const originalGetSelection = window.getSelection
    window.getSelection = () => { throw new Error('ambient selection must not be consulted') }
    try {
      middle.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
    } finally {
      window.getSelection = originalGetSelection
    }

    equal(root.querySelectorAll('.oe-poll__option-text').length, 2)
    const activeSelection = view.getSelection()
    assert(activeSelection?.rangeCount === 1, 'poll did not restore an owning-window selection')
    assert(root.contains(activeSelection.anchorNode), 'poll selection escaped its owning document block')
    plugin.destroy(root)
  }))
}
