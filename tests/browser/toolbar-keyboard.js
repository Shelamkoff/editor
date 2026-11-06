import { createDefaultInlineTools } from '../../preset/index.js'
import { createHeadingPlugin } from '../../plugins/heading/index.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { getTextOffset } from '../../shared/textOffset.js'
import en from '../../locale/en.js'
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

test('a keyboard-opened Heading choice commits one action and preserves the directed author range', async () => {
  const h = await setup(true), before = h.editor.save().blocks
  h.button.focus()
  key(h.button, 'ArrowUp')
  const last = document.activeElement
  equal(last.dataset.actionId, 'h6')
  // Synthetic keydown does not run a button's native Enter activation. The
  // physical keyboard path is covered by native-block-menus.js.
  last.click()
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
    const after = h.editor.save().blocks
    const field = editableField(h.editor, 'a'), native = window.getSelection()
    equal([
      getTextOffset(field, native.anchorNode, native.anchorOffset),
      getTextOffset(field, native.focusNode, native.focusOffset),
    ], [7, 1], 'formatting changed the author range direction')
    assert(h.editor.undo())
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
    assert(h.editor.redo())
    equal(h.editor.save().blocks, after)
  })
}

for (const type of ['align', 'bold']) {
  for (const retirement of ['document revision', 'same-key field replacement', 'native selection', 'foreign focus']) {
    test(`${type} rejects the keyboard Heading continuation after ${retirement}`, async () => {
      const h = await setup(true, retirement === 'same-key field replacement')
      h.button.focus()
      key(h.button, 'ArrowUp')
      key(document.activeElement, 'Escape')
      if (retirement === 'document revision') {
        h.editor.blocks.update('b', () => ({ data: { text: 'Changed elsewhere' } }))
      } else if (retirement === 'same-key field replacement') {
        const field = h.replaceField()
        window.getSelection().setBaseAndExtent(field.firstChild, 7, field.firstChild, 1)
        h.button.focus()
        // Discover the newly registered field before observing native effects;
        // its first projection hydration may replace its text node.
        key(h.button, 'ArrowDown')
        equal(h.button.getAttribute('aria-expanded'), 'false')
        window.getSelection().setBaseAndExtent(field.firstChild, 7, field.firstChild, 1)
        h.button.focus()
      } else if (retirement === 'native selection') {
        window.getSelection().setBaseAndExtent(h.field.firstChild, 5, h.field.firstChild, 2)
        h.button.focus()
      } else {
        const outside = document.createElement('button')
        document.body.append(outside)
        outside.focus()
        h.button.focus()
        outside.remove()
      }
      const before = h.editor.save().blocks, undoBefore = h.editor.canUndo
      const native = window.getSelection()
      const endpoints = [native.anchorNode, native.anchorOffset, native.focusNode, native.focusOffset]
      h.toolbar.querySelector(`[data-tool="${type}"]`).click()
      equal(h.editor.save().blocks, before)
      equal(h.editor.canUndo, undoBefore)
      assert(!h.toolbar.querySelector('.oe-inline-toolbar__align-panel'), 'retired interval opened an action panel')
      assert(document.activeElement === h.button, 'retired interval restored author focus')
      assert(native.anchorNode === endpoints[0] && native.anchorOffset === endpoints[1]
        && native.focusNode === endpoints[2] && native.focusOffset === endpoints[3],
        'retired interval changed the native selection')
    })
  }
}

function focusSuccessor(editor, outside, kind) {
  if (kind === 'outside' || kind === 'queued outside') {
    outside.focus()
    outside.setSelectionRange(2, 5, 'backward')
    assert(document.activeElement === outside, 'Commit observer did not acquire external focus')
    return
  }
  const field = editableField(editor, 'b')
  field.focus()
  window.getSelection().setBaseAndExtent(field.firstChild, 4, field.firstChild, 4)
  assert(document.activeElement === field, 'Commit observer did not acquire another author field')
}

function assertSuccessorFocus(editor, outside, kind) {
  if (kind === 'outside' || kind === 'queued outside') {
    assert(document.activeElement === outside, 'Old toolbar action reclaimed external native focus')
    equal([outside.selectionStart, outside.selectionEnd, outside.selectionDirection], [2, 5, 'backward'])
    return
  }
  const field = editableField(editor, 'b'), native = window.getSelection()
  assert(document.activeElement === field, 'Old toolbar action reclaimed another author field')
  equal(editor.blocks.currentId, 'b', 'Old toolbar action replaced the newer current block')
  equal([getTextOffset(field, native.anchorNode, native.anchorOffset), getTextOffset(field, native.focusNode, native.focusOffset)], [4, 4],
    'Old toolbar action replaced the newer caret')
}

for (const type of ['caseTransform', 'align']) for (const takeover of ['ordinary', 'outside', 'another field']) {
  test(`toolbar commit focus / inline ${type} / ${takeover}`, async () => {
    const diagnostics = [], commits = []
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], {
      locale: en, inlineTools: createDefaultInlineTools({ types: [type] }), onDiagnostic: value => diagnostics.push(value),
    })
    const outside = document.createElement('input')
    outside.value = 'External draft'
    // A consumer may contain its control's bubbling focus event. The editor
    // must still observe native ownership during the capture phase.
    outside.addEventListener('focusin', event => event.stopPropagation())
    document.body.append(outside)
    try {
      const before = editor.save().blocks
      const source = editableField(editor, 'a')
      select(source, 0, 5)
      document.dispatchEvent(new Event('selectionchange'))
      editor.on('transaction:committed', event => {
        if (event.action !== 'commit') return
        commits.push(event.name)
        if (takeover !== 'ordinary') focusSuccessor(editor, outside, takeover)
      })
      const toolbar = editorHolder(editor).querySelector('.oe-inline-toolbar')
      toolbar.querySelector(`[data-tool="${type}"]`).click()
      if (type === 'align') toolbar.querySelector('.oe-inline-toolbar__align-panel [aria-label="Align center"]').click()
      await Promise.resolve()
      const after = editor.save().blocks
      equal(commits, [type === 'align' ? 'format.text-align' : 'inline.caseTransform'])
      equal(after, type === 'align'
        ? [{ ...before[0], tunes: { textAlign: 'center' } }, before[1]]
        : [{ ...before[0], data: { text: 'ALPHA' } }, before[1]])
      if (takeover === 'ordinary') {
        assert(document.activeElement === source, 'Ordinary formatting lost author focus')
        equal(window.getSelection().toString(), type === 'align' ? 'Alpha' : 'ALPHA')
      } else assertSuccessorFocus(editor, outside, takeover)
      equal(editor.undo(), true)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false, 'Formatting created more than one history entry')
      equal(editor.redo(), true)
      equal(editor.save().blocks, after)
      equal(diagnostics, [])
    } finally { outside.remove() }
  })
}

for (const action of ['conversion', 'heading level']) for (const takeover of ['ordinary', 'outside', 'another field', 'queued outside', 'queued another field']) {
  test(`toolbar commit focus / inline ${action} / ${takeover}`, async () => {
    const diagnostics = [], commits = []
    const source = action === 'conversion' ? para('a', 'Alpha')
      : { id: 'a', type: 'heading', dataVersion: 2, data: { text: 'Alpha', level: 2 } }
    const editor = make([source, para('b', 'Bravo')], {
      locale: en, inlineTools: [], plugins: [createParagraphPlugin(), createHeadingPlugin()],
      blockInsertAnimationMs: 0, blockMoveAnimationMs: 0, blockRemoveAnimationMs: 0,
      onDiagnostic: value => diagnostics.push(value),
    })
    const outside = document.createElement('input')
    outside.value = 'External draft'
    outside.addEventListener('focusin', event => event.stopPropagation())
    document.body.append(outside)
    try {
      const before = editor.save().blocks
      select(editableField(editor, 'a'), 0, 5)
      document.dispatchEvent(new Event('selectionchange'))
      const toolbar = editorHolder(editor).querySelector('.oe-inline-toolbar')
      toolbar.querySelector(action === 'conversion' ? '.oe-inline-toolbar__type-select' : '.oe-inline-toolbar__level-select').click()
      const item = toolbar.querySelector(action === 'conversion' ? '[data-plugin-type="heading"]' : '[data-action-id="h3"]')
      assert(item, `Inline action is missing: ${action}`)
      editor.on('transaction:committed', event => {
        if (event.action !== 'commit') return
        commits.push(event.name)
        if (takeover.startsWith('queued')) queueMicrotask(() => focusSuccessor(editor, outside, takeover))
        else if (takeover !== 'ordinary') focusSuccessor(editor, outside, takeover)
      })
      item.click()
      await Promise.resolve()
      const after = editor.save().blocks
      equal(commits, [action === 'conversion' ? 'selection.convert' : 'block.inline-control'])
      equal(after, [{ ...before[0], type: 'heading', data: { text: 'Alpha', level: action === 'conversion' ? 2 : 3 } }, before[1]])
      if (takeover === 'ordinary') {
        const field = editableField(editor, 'a'), native = window.getSelection()
        assert(document.activeElement === field, 'Ordinary inline block action lost author focus')
        equal([getTextOffset(field, native.anchorNode, native.anchorOffset), getTextOffset(field, native.focusNode, native.focusOffset)],
          action === 'conversion' ? [0, 0] : [0, 5])
      } else assertSuccessorFocus(editor, outside, takeover)
      equal(editor.undo(), true)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false, 'Inline block action created more than one history entry')
      equal(editor.redo(), true)
      equal(editor.save().blocks, after)
      equal(diagnostics, [])
    } finally { outside.remove() }
  })
}

for (const action of ['Duplicate', 'Move down', 'Delete']) for (const takeover of ['ordinary', 'outside', 'another field', 'queued outside']) {
  test(`toolbar commit focus / block ${action} / ${takeover}`, async () => {
    const diagnostics = [], commits = []
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], {
      locale: en, inlineTools: [], blockInsertAnimationMs: 0, blockMoveAnimationMs: 0, blockRemoveAnimationMs: 0,
      onDiagnostic: value => diagnostics.push(value),
    })
    const outside = document.createElement('input')
    outside.value = 'External draft'
    outside.addEventListener('focusin', event => event.stopPropagation())
    document.body.append(outside)
    try {
      const before = editor.save().blocks
      editor.blocks.focus('a', { offset: 2 })
      const holder = editorHolder(editor), settings = holder.querySelector('.oe-settings-menu')
      holder.querySelector('.oe-toolbar__drag').click()
      const item = [...settings.querySelectorAll('.oe-settings-menu__item')]
        .find(node => node.querySelector('.oe-settings-menu__label')?.textContent === action)
      assert(item, `Settings action is missing: ${action}`)
      editor.on('transaction:committed', event => {
        if (event.action !== 'commit') return
        commits.push(event.name)
        if (takeover === 'queued outside') queueMicrotask(() => focusSuccessor(editor, outside, takeover))
        else if (takeover !== 'ordinary') focusSuccessor(editor, outside, takeover)
      })
      item.click()
      await Promise.resolve()
      const after = editor.save().blocks
      equal(commits, [action === 'Duplicate' ? 'block.duplicate' : action === 'Delete' ? 'block.remove' : 'block.move'])
      if (action === 'Duplicate') {
        equal(after.map(block => [block.type, block.data.text]), [['paragraph', 'Alpha'], ['paragraph', 'Alpha'], ['paragraph', 'Bravo']])
        assert(after[1].id !== 'a' && after[1].id !== 'b', 'Duplicate did not receive a fresh id')
      } else equal(after, action === 'Delete' ? [before[1]] : [before[1], before[0]])
      if (takeover === 'ordinary') {
        if (action === 'Move down') {
          assert(document.activeElement === settings && settings.style.display !== 'none', 'Ordinary move lost its usable settings menu')
          const up = [...settings.querySelectorAll('.oe-settings-menu__item')]
            .find(node => node.querySelector('.oe-settings-menu__label')?.textContent === 'Move up')
          assert(up?.getAttribute('aria-disabled') !== 'true', 'Moved block cannot move back up')
        } else assert(document.activeElement === editableField(editor, action === 'Delete' ? 'b' : after[1].id), 'Ordinary block action lost its planned focus')
      } else assertSuccessorFocus(editor, outside, takeover)
      equal(editor.undo(), true)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false, 'Block action created more than one history entry')
      equal(editor.redo(), true)
      equal(editor.save().blocks, after)
      equal(diagnostics, [])
    } finally { outside.remove() }
  })
}

await run()
