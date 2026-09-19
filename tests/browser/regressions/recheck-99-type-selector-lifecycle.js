import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Heading } from '../../../plugins/heading/index.js'
import { test, make, para, select, assert, equal } from './harness.js'

function setup() {
  const editor = make([para('a', 'KEEP')], { plugins: [new Paragraph(), new Heading()] })
  const field = editor.blocks.getBlockById('a').contentElement
  select(field, 0, 4)
  const button = editor.rootElement.querySelector('.oe-inline-toolbar__type-select')
  button.click()
  const item = editor.rootElement.querySelector('.oe-inline-toolbar__type-item[data-plugin-type="heading"]')
  assert(item, 'heading item must exist in the open menu')
  return { editor, button, item }
}

export function register() {
  test('closed type menu cannot convert through a retained item', () => {
    const { editor, button, item } = setup()
    button.click()
    const before = editor.save().blocks
    item.click()
    equal(editor.save().blocks, before)
  })

  test('reopened type menu rejects old items but its current items still convert', () => {
    const { editor, button, item } = setup()
    button.click(); button.click()
    const before = editor.save().blocks
    item.click()
    equal(editor.save().blocks, before, 'previous session cannot change the current document')
    const currentItem = editor.rootElement.querySelector('.oe-inline-toolbar__type-item[data-plugin-type="heading"]')
    assert(currentItem !== item)
    currentItem.click()
    equal(editor.save().blocks[0].type, 'heading')
    editor.undo()
    equal(editor.save().blocks, before)
  })

  test('read-only teardown revokes type-menu callbacks and queued autofocus', async () => {
    const { editor, button, item } = setup()
    editor.readOnly = true
    const before = editor.save().blocks
    const sentinel = document.createElement('button')
    sentinel.textContent = 'outside editor'
    document.body.appendChild(sentinel)
    try {
      sentinel.focus()
      item.click(); button.click()
      await new Promise(resolve => requestAnimationFrame(resolve))
      equal(editor.save().blocks, before)
      equal(document.activeElement, sentinel, 'retired menu must not steal focus')
      equal(button.getAttribute('aria-expanded'), 'false')
    } finally { sentinel.remove() }
  })
}
