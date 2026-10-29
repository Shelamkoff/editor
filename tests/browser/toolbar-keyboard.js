import { createHeadingPlugin } from '../../plugins/heading/index.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { test, assert, equal, make, para, editableField, editorHolder, select, key, pause, run } from './regressions/harness.js'

async function setup(backward = false) {
  const editor = make([{ id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Heading text', level: 2 } }, para('b', 'Other')], { plugins: [createParagraphPlugin(), createHeadingPlugin()] })
  const field = editableField(editor, 'a')
  select(field, 1, 7)
  if (backward) window.getSelection().setBaseAndExtent(field.firstChild, 7, field.firstChild, 1)
  field.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  document.dispatchEvent(new Event('selectionchange'))
  await pause(120)
  const toolbar = editorHolder(editor).querySelector('.oe-inline-toolbar')
  assert(toolbar && toolbar.style.display === 'flex', 'precondition: selected Heading shows toolbar')
  const button = toolbar.querySelector('.oe-inline-toolbar__level-select')
  assert(button && !button.hidden && !button.disabled, 'precondition: level control is available')
  return { editor, field, toolbar, button }
}
const items = () => [...document.querySelectorAll('.oe-inline-toolbar__level-dropdown [data-action-id]')]

for (const [arrow, expected] of [['ArrowDown', '1'], ['ArrowUp', '6']]) {
  test(`${arrow} opens Heading levels from keyboard focus without a pointer bookmark`, async () => {
    const h = await setup()
    const before = h.editor.save().blocks
    h.button.focus()
    assert(key(h.button, arrow).defaultPrevented)
    equal(h.button.getAttribute('aria-expanded'), 'true')
    equal(items().map(item => item.dataset.actionId), ['1', '2', '3', '4', '5', '6'])
    equal(document.activeElement.dataset.actionId, expected)
    equal(items().filter(item => item.getAttribute('aria-checked') === 'true').map(item => item.dataset.actionId), ['2'])
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
  })
}

test('keyboard Heading choice commits one action and preserves the directed author range', async () => {
  const h = await setup(true), before = h.editor.save().blocks
  h.button.focus()
  key(h.button, 'ArrowUp')
  const last = document.activeElement
  equal(last.dataset.actionId, '6')
  key(last, 'Enter')
  await pause()
  equal(h.editor.save().blocks[0].data.level, 6)
  const field = editableField(h.editor, 'a'), native = window.getSelection()
  assert(native.anchorNode === field.firstChild && native.focusNode === field.firstChild)
  equal([native.anchorOffset, native.focusOffset], [7, 1])
  assert(h.editor.undo())
  equal(h.editor.save().blocks, before)
  equal(h.editor.canUndo, false)
  assert(h.editor.redo())
  equal(h.editor.save().blocks[0].data.level, 6)
})

test('Escape restores the range and leaves the level control available to reopen', async () => {
  const h = await setup(true)
  h.button.focus()
  key(h.button, 'ArrowDown')
  key(document.activeElement, 'Escape')
  equal(h.button.getAttribute('aria-expanded'), 'false')
  assert(document.activeElement === h.button)
  const native = window.getSelection()
  equal([native.anchorOffset, native.focusOffset], [7, 1])
  key(h.button, 'ArrowUp')
  equal(h.button.getAttribute('aria-expanded'), 'true')
  equal(document.activeElement.dataset.actionId, '6')
  equal(h.editor.canUndo, false)
})

for (const retirement of ['document revision', 'same-key field replacement', 'native selection', 'foreign focus']) {
  test(`keyboard controls reject a retained interval after ${retirement}`, async () => {
    const h = await setup()
    h.button.focus()
    if (retirement === 'document revision') {
      h.editor.blocks.update('b', () => ({ data: { text: 'Changed elsewhere' } }))
    } else if (retirement === 'same-key field replacement') {
      h.field.replaceWith(h.field.cloneNode(true))
    } else if (retirement === 'native selection') {
      window.getSelection().setBaseAndExtent(h.field.firstChild, 2, h.field.firstChild, 5)
    } else {
      const outside = document.createElement('button')
      document.body.append(outside)
      outside.focus()
      h.button.focus()
      outside.remove()
    }
    const before = h.editor.save().blocks
    key(h.button, 'ArrowDown')
    equal(h.button.getAttribute('aria-expanded'), 'false')
    equal(h.editor.save().blocks, before)
  })
}

for (const change of ['selection', 'foreign focus']) {
  test(`an open Heading menu cannot apply its old selection after a newer ${change}`, async () => {
    const h = await setup()
    h.button.focus()
    key(h.button, 'ArrowDown')
    const retained = items().at(-1)
    assert(retained, 'precondition: menu has a retained action')
    if (change === 'selection') {
      window.getSelection().setBaseAndExtent(h.field.firstChild, 2, h.field.firstChild, 5)
    } else {
      const outside = document.createElement('button')
      document.body.append(outside)
      outside.focus()
      outside.remove()
    }
    const before = h.editor.save().blocks
    retained.click()
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
  })
}

await run()
