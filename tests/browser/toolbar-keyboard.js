import { createDefaultInlineTools } from '../../preset/index.js'
import { createHeadingPlugin } from '../../plugins/heading/index.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { test, assert, equal, make, para, editableField, editorHolder, select, key, pause, run } from './regressions/harness.js'

async function setup(backward = false, dynamic = false) {
  let replaceField = () => { throw new Error('Not a dynamic fixture') }
  const heading = createHeadingPlugin()
  // A cooperative extension may change its registered field without a model
  // revision. Keep its descriptor and reader synchronized with the new DOM.
  const plugin = !dynamic ? heading : { ...heading, setup() {
    return { create(initial, context) {
      const host = context.ownerDocument.createElement('div')
      let data = { ...initial }, current, readOnly = context.isReadOnly()
      const paint = next => {
        const replacement = context.ownerDocument.createElement('h' + next.level)
        replacement.textContent = next.text
        replacement.contentEditable = String(!readOnly)
        if (current) current.replaceWith(replacement)
        else host.append(replacement)
        current = replacement
        data = { ...next }
      }
      paint(data)
      replaceField = () => { paint(data); return current }
      return {
        element: host, read: () => ({ ...data, text: current.textContent }),
        update: paint,
        editableFields: () => [{ key: 'text', mode: 'rich-text', element: current }],
        setReadOnly(value) { readOnly = value; current.contentEditable = String(!value) },
        focus() { current.focus() }, destroy() {},
      }
    }, destroy() {} }
  } }
  const editor = make([{ id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Heading text', level: 2 } }, para('b', 'Other')], { plugins: [createParagraphPlugin(), plugin], inlineTools: createDefaultInlineTools({ types: ['bold', 'align'] }) })
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
  return { editor, field, toolbar, button, replaceField }
}
const items = () => [...document.querySelectorAll('.oe-inline-toolbar__level-dropdown [data-action-id]')]

for (const [arrow, expected] of [['ArrowDown', 'h2'], ['ArrowUp', 'h6']]) {
  test(`${arrow} opens Heading levels from keyboard focus without a pointer bookmark`, async () => {
    const h = await setup()
    const before = h.editor.save().blocks
    h.button.focus()
    assert(key(h.button, arrow).defaultPrevented)
    equal(h.button.getAttribute('aria-expanded'), 'true')
    equal(items().map(item => item.dataset.actionId), ['h2', 'h3', 'h4', 'h5', 'h6'])
    equal(document.activeElement.dataset.actionId, expected)
    equal(items().filter(item => item.getAttribute('aria-checked') === 'true').map(item => item.dataset.actionId), ['h2'])
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
  })
}

test('keyboard Heading choice commits one action and preserves the directed author range', async () => {
  const h = await setup(true), before = h.editor.save().blocks
  h.button.focus()
  key(h.button, 'ArrowUp')
  const last = document.activeElement
  equal(last.dataset.actionId, 'h6')
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
  equal(document.activeElement.dataset.actionId, 'h6')
  equal(h.editor.canUndo, false)
})

for (const retirement of ['document revision', 'same-key field replacement', 'native selection', 'foreign focus']) {
  test(`keyboard controls reject a retained interval after ${retirement}`, async () => {
    const h = await setup(false, retirement === 'same-key field replacement')
    h.button.focus()
    if (retirement === 'document revision') {
      h.editor.blocks.update('b', () => ({ data: { text: 'Changed elsewhere' } }))
    } else if (retirement === 'same-key field replacement') {
      const next = h.replaceField()
      assert(next !== h.field && next.isConnected, 'precondition: new registered field owner')
      window.getSelection().setBaseAndExtent(next.firstChild, 1, next.firstChild, 7)
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

for (const type of ['align', 'bold']) {
  test(`${type} can use the accepted range after keyboard Heading Escape`, async () => {
    const h = await setup(true), before = h.editor.save().blocks
    h.button.focus()
    key(h.button, 'ArrowUp')
    key(document.activeElement, 'Escape')
    assert(document.activeElement === h.button)
    h.toolbar.querySelector(`[data-tool="${type}"]`).click()
    if (type === 'align') {
      const center = h.toolbar.querySelector('.oe-inline-toolbar__align-panel [aria-label="Align center"]')
      assert(center, 'accepted toolbar selection did not open the alignment panel')
      center.click()
      equal(h.editor.save().blocks[0].tunes, { textAlign: 'center' })
    } else {
      equal(h.editor.save().blocks[0].data.text, 'H<b>eading</b> text')
    }
    assert(h.editor.undo())
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
  })
}

await run()
