import { createGalleryAltFixture } from './gallery-derived-alt-fixture.js'
import { test, assert, equal } from './harness.js'
import { clickNative, printable, dispatchKey } from '../native-input-helpers.js'

for (const index of [0, 1]) test(`Gallery derived alt native ${index === 0 ? 'grid' : 'overflow'} caption input and exact one keyboard Undo/Redo`, async () => {
  const h = await createGalleryAltFixture({ widgetIndex: null })
  try {
    const old = h.current(index), before = h.editor.save().blocks, after = structuredClone(before), events = [], failures = []
    after[0].data.images[index].caption += 'X'
    await clickNative(old.caption)
    const tail = old.caption.lastChild
    assert(tail.nodeType === Node.TEXT_NODE)
    window.getSelection().setBaseAndExtent(tail, tail.length, tail, tail.length)
    old.caption.addEventListener('input', event => events.push({ trusted: event.isTrusted, type: event.inputType }), { once: true })
    await printable('X')
    equal(events, [{ trusted: true, type: 'insertText' }], 'The browser must perform the actual author edit')
    equal(h.editor.save().blocks, after); assert(h.editor.canUndo && !h.editor.canRedo)
    assert(h.current(index).caption === old.caption, 'Ordinary native text input must retain its live host')
    if (h.current(index).image.alt !== h.expectedText[index] + 'X') failures.push('input: stale alt')
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(h.editor.save().blocks, before); assert(!h.editor.canUndo && h.editor.canRedo)
    const restored = h.current(index), selection = window.getSelection()
    assert(restored.caption.contains(selection.anchorNode) && restored.caption.contains(selection.focusNode),
      'History must restore the actual current caption owner')
    if (restored.image.alt !== h.expectedText[index]) failures.push('undo: stale alt')
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(h.editor.save().blocks, after); assert(h.editor.canUndo && !h.editor.canRedo)
    if (h.current(index).image.alt !== h.expectedText[index] + 'X') failures.push('redo: stale alt')
    equal(h.transactions.map(event => event.action), ['commit', 'undo', 'redo'])
    assert(failures.length === 0, failures.join('\n'))
  } finally { h.dispose() }
})

test('Gallery derived alt native caption input cannot write its separately adopted image', async () => {
  const h = await createGalleryAltFixture({ widgetIndex: null }), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    const current = h.current(0), before = h.editor.save().blocks, expected = structuredClone(before)
    foreign.append(current.image); current.image.alt = 'foreign native image sentinel'
    await clickNative(current.caption)
    const tail = current.caption.lastChild
    window.getSelection().setBaseAndExtent(tail, tail.length, tail, tail.length)
    let trusted = false
    current.caption.addEventListener('input', event => { trusted = event.isTrusted }, { once: true })
    await printable('X')
    assert(trusted, 'Use a real native input while the auxiliary target is foreign')
    expected[0].data.images[0].caption += 'X'
    equal(h.editor.save().blocks, expected); equal(h.transactions.length, 1)
    equal(current.image.alt, 'foreign native image sentinel')
    assert(current.image.parentNode === foreign)
  } finally { h.dispose(); foreign.remove() }
})

test('Gallery derived alt native input works after the real Masonry owner wraps its slot', async () => {
  const h = await createGalleryAltFixture({ layout: 'masonry', widgetIndex: null })
  try {
    const old = h.current(0), before = h.editor.save().blocks, expected = structuredClone(before), parent = old.slot.parentNode
    assert(parent.classList.contains('masonry-item'), 'This control requires the installed layout wrapper')
    await clickNative(old.caption)
    const tail = old.caption.lastChild
    window.getSelection().setBaseAndExtent(tail, tail.length, tail, tail.length)
    let trusted = false
    old.caption.addEventListener('input', event => { trusted = event.isTrusted }, { once: true })
    await printable('X')
    assert(trusted)
    expected[0].data.images[0].caption += 'X'
    equal(h.editor.save().blocks, expected); equal(h.transactions.length, 1)
    assert(h.current(0).slot === old.slot && old.slot.parentNode === parent)
    equal(old.image.alt, h.expectedText[0] + 'X', 'A real author input cannot leave alternative text stale after layout')
  } finally { h.dispose() }
})


test('Gallery derived alt native input cannot act through a foreign owner inside its original grid', async () => {
  const h = await createGalleryAltFixture({ widgetIndex: null })
  try {
    const old = h.current(0), before = h.editor.save().blocks, foreign = document.createElement('div')
    foreign.contentEditable = 'true'
    old.slot.parentElement.append(foreign); foreign.append(old.slot)
    old.image.alt = 'foreign nested owner sentinel'
    await clickNative(old.caption)
    const tail = old.caption.lastChild
    window.getSelection().setBaseAndExtent(tail, tail.length, tail, tail.length)
    const inputs = []
    foreign.addEventListener('input', event => inputs.push(event.isTrusted))
    await printable('X')
    equal(inputs, [true], 'The foreign editable must receive a real browser input')
    equal(h.editor.save().blocks, before); equal(h.transactions.length, 0)
    equal(old.image.alt, 'foreign nested owner sentinel')
    assert(old.slot.parentElement === foreign)
  } finally { h.dispose() }
})


test('Gallery derived alt native input cannot update a whole instance adopted by a foreign host', async () => {
  const h = await createGalleryAltFixture({ widgetIndex: null }), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    const old = h.current(0), before = h.editor.save().blocks
    foreign.append(old.wrapper)
    old.image.alt = 'foreign instance sentinel'
    await clickNative(old.caption)
    const tail = old.caption.lastChild
    window.getSelection().setBaseAndExtent(tail, tail.length, tail, tail.length)
    const inputs = []
    old.caption.addEventListener('input', event => inputs.push(event.isTrusted))
    await printable('X')
    equal(inputs, [true], 'The adopted caption must receive real input outside the original editor')
    equal(h.editor.save().blocks, before); equal(h.transactions.length, 0)
    equal(old.image.alt, 'foreign instance sentinel')
    assert(old.wrapper.parentElement === foreign)
  } finally { h.dispose(); foreign.remove() }
})
