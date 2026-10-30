import { createGalleryAltFixture, galleryWidgetText } from './gallery-derived-alt-fixture.js'
import { test, assert, equal, pause } from './harness.js'

for (const widgetIndex of [null, 0, 1]) test(`Gallery derived alt after ${widgetIndex === null ? 'literal entity' : widgetIndex === 0 ? 'grid widget' : 'overflow widget'} load`, async () => {
  const h = await createGalleryAltFixture({ widgetIndex })
  try {
    equal([h.current(0).image.alt, h.current(1).image.alt], h.expectedText,
      'Each alternative text must equal its own completed caption, decoded exactly once')
    equal(h.editor.save().blocks, h.input.blocks)
    assert(!h.editor.canUndo && !h.editor.canRedo && h.transactions.length === 0)
  } finally { h.dispose() }
})

for (const readOnly of [false, true]) test(`Gallery derived alt after mode ${readOnly} to ${!readOnly}`, async () => {
  const h = await createGalleryAltFixture({ widgetIndex: 1, readOnly })
  try {
    const before = h.editor.save().blocks, old = h.current()
    h.editor.setReadOnly(!readOnly)
    const current = h.current()
    assert(current.wrapper === old.wrapper && current.caption !== old.caption && !old.slot.isConnected,
      'Gallery keeps its wrapper and intentionally retires its mode-specific slots')
    equal(current.caption.textContent, galleryWidgetText)
    equal([h.current(0).image.alt, current.image.alt], h.expectedText)
    equal(h.editor.save().blocks, before)
    equal(h.editor.readOnly, !readOnly)
    assert(!h.editor.canUndo && h.transactions.length === 0)
  } finally { h.dispose() }
})

for (const id of ['mention', 'swatch']) test(`Gallery derived alt follows actual ${id} update and one Undo/Redo with the backward range intact`, async () => {
  const h = await createGalleryAltFixture({ widgetIndex: id === 'mention' ? 1 : 0 })
  try {
    const before = h.editor.save().blocks, expected = structuredClone(before), original = h.current()
    const sibling = h.current(id === 'mention' ? 0 : 1), tail = original.caption.lastChild
    if (id === 'mention') expected[0].inline.mention.data.name = 'Grace'
    else expected[0].inline.swatch.data.value = '#654321'
    const text = id === 'mention' ? 'Alpha @Grace #123456 tail' : 'Alpha @Ada #654321 tail'
    assert(tail.nodeType === Node.TEXT_NODE && tail.data === ' tail')
    original.caption.focus(); window.getSelection().setBaseAndExtent(tail, 4, tail, 1)
    const selected = window.getSelection().toString(), failures = []
    const check = (condition, message) => { if (!condition) failures.push(message) }
    const inspect = (label, expectedText) => {
      const current = h.current(), selection = window.getSelection()
      check(current.caption === original.caption && current.image === original.image && current.caption.lastChild === tail,
        label + ': an unchanged Gallery view or authored tail was replaced')
      check(current.caption.textContent === expectedText, label + ': actual inline label is wrong')
      check(current.image.alt === expectedText, label + ': alternative text is stale')
      check(selection.toString() === selected && selection.anchorNode === tail && selection.focusNode === tail
        && selection.anchorOffset === 4 && selection.focusOffset === 1 && document.activeElement === current.caption,
      label + ': the exact backward author range changed')
      check(sibling.caption.isConnected && sibling.image.alt === h.expectedText[id === 'mention' ? 0 : 1],
        label + ': independent sibling alternative text changed')
    }
    const widget = h.inlineCurrent(id)
    assert(widget, 'Use the actual registered inline occurrence and scoped update')
    widget.context.updateData(value => id === 'mention' ? { ...value, name: 'Grace' } : { ...value, value: '#654321' })
    equal(h.editor.save().blocks, expected); equal(h.transactions.length, 1)
    assert(h.editor.canUndo && !h.editor.canRedo); inspect('update', text)
    assert(h.editor.undo()); equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.editor.canRedo); inspect('undo', galleryWidgetText)
    assert(h.editor.redo()); equal(h.editor.save().blocks, expected)
    assert(h.editor.canUndo && !h.editor.canRedo); inspect('redo', text)
    equal(h.transactions.length, 3, 'Auxiliary alt cannot create transactions')
    assert(failures.length === 0, failures.join('\n'))
  } finally { h.dispose() }
})

test('Gallery derived alt rejects a descriptor with the wrong key, element or mode', async () => {
  const h = await createGalleryAltFixture()
  try {
    const old = h.current(), before = h.editor.save().blocks
    old.image.alt = 'exact descriptor sentinel'
    for (const field of [
      { ...old.field, key: 'image:second:caption' },
      { ...old.field, element: h.current(1).caption },
      { ...old.field, mode: 'plain-text' },
    ]) old.instance.afterProjection?.(Object.freeze(field))
    equal(old.image.alt, 'exact descriptor sentinel')
    equal(h.editor.save().blocks, before); equal(h.transactions.length, 0)
  } finally { h.dispose() }
})

test('Gallery derived alt cannot update a retired same-key slot after a mode rebuild', async () => {
  const h = await createGalleryAltFixture()
  try {
    const old = h.current(), before = h.editor.save().blocks
    h.editor.setReadOnly(true); h.editor.setReadOnly(false)
    const current = h.current()
    assert(current.caption !== old.caption && current.field.key === old.field.key && !old.slot.isConnected)
    old.caption.textContent = 'Retired input'
    old.image.alt = 'retired image sentinel'
    current.image.alt = 'successor image sentinel'
    old.caption.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Retired input', inputType: 'insertText' }))
    old.instance.afterProjection?.(old.field)
    await pause()
    equal(old.image.alt, 'retired image sentinel'); equal(current.image.alt, 'successor image sentinel')
    equal(h.editor.save().blocks, before); equal(h.transactions.length, 0)
  } finally { h.dispose() }
})

for (const target of ['image', 'caption', 'slot']) test(`Gallery derived alt ignores its ${target} adopted outside the exact view parent`, async () => {
  const h = await createGalleryAltFixture(), foreign = document.createElement('aside')
  try {
    const old = h.current(), before = h.editor.save().blocks
    // Keep a displaced field under the same block; this probes the consumer's
    // exact view relationship rather than a different core owner failure.
    old.wrapper.append(foreign)
    foreign.append(old[target])
    old.image.alt = 'adopted image sentinel'
    old.instance.afterProjection?.(old.field)
    equal(old.image.alt, 'adopted image sentinel')
    assert(old[target].parentNode === foreign, 'The consumer must not take an adopted node back')
    equal(h.editor.save().blocks, before); equal(h.transactions.length, 0)
  } finally { h.dispose(); foreign.remove() }
})

test('Gallery derived alt cannot revive a disposed instance through retained input or completion', async () => {
  const h = await createGalleryAltFixture()
  try {
    const old = h.current()
    h.destroy(); assert(old.context.signal.aborted)
    old.caption.textContent = 'Disposed input'; old.image.alt = 'disposed image sentinel'
    old.caption.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Disposed input', inputType: 'insertText' }))
    old.instance.afterProjection?.(old.field)
    await pause()
    equal(old.image.alt, 'disposed image sentinel')
  } finally { h.dispose() }
})

test('Gallery derived alt follows a widget after the real Masonry owner wraps its slot', async () => {
  const h = await createGalleryAltFixture({ layout: 'masonry', widgetIndex: 1 })
  try {
    const before = h.editor.save().blocks, expected = structuredClone(before), old = h.current(), parent = old.slot.parentNode
    expected[0].inline.mention.data.name = 'Grace'
    assert(parent.classList.contains('masonry-item'), 'This control must run after real asynchronous wrapping')
    h.inlineCurrent('mention').context.updateData(value => ({ ...value, name: 'Grace' }))
    equal(h.editor.save().blocks, expected)
    equal(h.current().caption.textContent, 'Alpha @Grace #123456 tail')
    assert(h.current().slot === old.slot && old.slot.parentNode === parent, 'The payload update must retain the actual Masonry slot')
    equal(h.transactions.length, 1)
    equal(old.image.alt, 'Alpha @Grace #123456 tail', 'The legitimate Masonry wrapper must not suppress completion')
  } finally { h.dispose() }
})


test('Gallery derived alt allows a transparent layout wrapper under the original grid', async () => {
  const h = await createGalleryAltFixture({ widgetIndex: 0 })
  try {
    const old = h.current(), grid = old.slot.parentElement, before = h.editor.save().blocks
    const layout = document.createElement('div'), inner = document.createElement('div')
    grid.append(layout); layout.append(inner); inner.append(old.slot)
    const expected = structuredClone(before)
    expected[0].inline.mention.data.name = 'Grace'
    h.inlineCurrent('mention').context.updateData(value => ({ ...value, name: 'Grace' }))
    equal(h.editor.save().blocks, expected)
    equal(old.caption.textContent, 'Alpha @Grace #123456 tail')
    equal(old.image.alt, 'Alpha @Grace #123456 tail')
    assert(old.slot.parentElement === inner && inner.parentElement === layout && layout.parentElement === grid)
    equal(h.transactions.length, 1)
  } finally { h.dispose() }
})

for (const kind of ['editable', 'readonly', 'plaintext', 'widget', 'button', 'textbox', 'block']) {
  test(`Gallery derived alt rejects a ${kind} owner substituted between slot and original grid`, async () => {
    const h = await createGalleryAltFixture()
    try {
      const old = h.current(), grid = old.slot.parentElement, before = h.editor.save().blocks
      const foreign = document.createElement(kind === 'button' ? 'button' : 'div')
      if (kind === 'editable') foreign.contentEditable = 'true'
      if (kind === 'readonly') foreign.contentEditable = 'false'
      if (kind === 'plaintext') foreign.contentEditable = 'plaintext-only'
      if (kind === 'widget') foreign.setAttribute('data-inline-plugin', 'foreign')
      if (kind === 'textbox') foreign.setAttribute('role', 'textbox')
      if (kind === 'block') foreign.setAttribute('data-block-id', 'foreign')
      grid.append(foreign); foreign.append(old.slot)
      old.image.alt = 'foreign owner sentinel'
      old.instance.afterProjection?.(old.field)
      equal(old.image.alt, 'foreign owner sentinel')
      assert(old.slot.parentElement === foreign)
      equal(h.editor.save().blocks, before); equal(h.transactions.length, 0)
    } finally { h.dispose() }
  })
}

test('Gallery derived alt rejects an original grid adopted outside the captured Gallery wrapper', async () => {
  const h = await createGalleryAltFixture(), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    const old = h.current(), grid = old.slot.parentElement, before = h.editor.save().blocks
    foreign.append(grid); old.image.alt = 'foreign grid sentinel'
    old.instance.afterProjection?.(old.field)
    equal(old.image.alt, 'foreign grid sentinel')
    assert(grid.parentElement === foreign)
    equal(h.editor.save().blocks, before); equal(h.transactions.length, 0)
  } finally { h.dispose(); foreign.remove() }
})
