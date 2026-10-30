import { test, assert, equal, pause } from './harness.js'
import { pollDerivedFixture, checkPollDerivedLabel, optionText } from '../poll-derived-fixture.js'

test('Poll derived results retain author marks through load and both modes without a document action', async () => {
  const h = await pollDerivedFixture()
  try {
    const before = h.editor.save().blocks
    for (const mode of [false, true, false]) {
      if (h.editor.readOnly !== mode) h.editor.setReadOnly(mode)
      checkPollDerivedLabel(h)
      equal(h.editor.save().blocks, before)
    }
    equal(h.transactions.length, 0)
    assert(!h.editor.canUndo)
  } finally { h.dispose() }
})

for (const id of ['mention', 'swatch']) test(`Poll derived results follow ${id} changes and one Undo/Redo without moving a backward range`, async () => {
  const h = await pollDerivedFixture()
  try {
    const before = h.editor.save().blocks, field = h.field(), tail = field.lastChild, selection = getSelection()
    assert(tail?.nodeType === Node.TEXT_NODE && tail.data === ' tail')
    field.focus(); selection.setBaseAndExtent(tail, 4, tail, 1)
    const range = () => ({ field: h.field() === field, tail: field.lastChild === tail,
      anchor: selection.anchorNode === tail, anchorOffset: selection.anchorOffset,
      focus: selection.focusNode === tail, focusOffset: selection.focusOffset, active: document.activeElement === field })
    const expectedRange = range(), after = structuredClone(before)
    if (id === 'mention') after[0].inline.mention.data.name = 'Grace'
    else after[0].inline.swatch.data.value = '#654321'
    h.widget(id).context.updateData(data => id === 'mention' ? { ...data, name: 'Grace' } : { ...data, value: '#654321' })
    equal(h.editor.save().blocks, after)
    equal(range(), expectedRange)
    checkPollDerivedLabel(h, id === 'mention' ? 'Answer @Grace #123456 tail' : 'Answer @Ada #654321 tail')
    assert(h.editor.undo()); equal(h.editor.save().blocks, before); checkPollDerivedLabel(h)
    assert(!h.editor.canUndo && h.editor.canRedo)
    assert(h.editor.redo()); equal(h.editor.save().blocks, after)
    checkPollDerivedLabel(h, id === 'mention' ? 'Answer @Grace #123456 tail' : 'Answer @Ada #654321 tail')
    equal(range(), expectedRange)
    equal(h.transactions.length, 3)
  } finally { h.dispose() }
})

test('Poll runtime-only result replacement reads retained completed option fields', async () => {
  const h = await pollDerivedFixture()
  try {
    const before = h.editor.save().blocks, field = h.field(), result = h.result(), widget = h.widget('mention')
    h.root().querySelector('.oe-poll__choice[data-option-id="first"]').click()
    checkPollDerivedLabel(h)
    assert(h.field() === field && h.widget('mention') === widget && h.result() !== result && !result.isConnected)
    equal(h.editor.save().blocks, before); equal(h.transactions.length, 0)
    assert(!h.editor.canUndo)
  } finally { h.dispose() }
})

test('Poll completion cannot change a result label adopted by a foreign container', async () => {
  const h = await pollDerivedFixture(), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    const label = h.result()
    foreign.append(label); label.textContent = 'foreign result sentinel'
    h.widget('mention').context.updateData(data => ({ ...data, name: 'Grace' }))
    equal(h.field().textContent, 'Answer @Grace #123456 tail')
    equal(label.textContent, 'foreign result sentinel')
    assert(label.parentNode === foreign)
  } finally { h.dispose(); foreign.remove() }
})

test('Poll detached author boundary cannot refresh derived results after the whole wrapper is adopted elsewhere', async () => {
  const h = await pollDerivedFixture(), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    const wrapper = h.root().querySelector('.oe-poll'), field = h.field(), result = h.result(), before = h.editor.save().blocks
    foreign.append(wrapper)
    field.append(document.createTextNode(' foreign input'))
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' foreign input' }))
    await pause(20)
    equal(result.textContent, optionText, 'An adopted author boundary must not publish a new derived label')
    equal(h.editor.save().blocks, before)
    equal(h.transactions.length, 0)
    assert(wrapper.parentNode === foreign)
  } finally { h.dispose(); foreign.remove() }
})

test('Poll retired option input cannot replace the current result projection', async () => {
  const h = await pollDerivedFixture()
  try {
    const old = h.field()
    h.editor.setReadOnly(true)
    const before = h.editor.save().blocks, current = h.field()
    assert(current !== old && !old.isConnected)
    old.textContent = 'retired option'
    old.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'retired' }))
    old.dispatchEvent(new FocusEvent('blur'))
    await pause(20)
    equal(h.editor.save().blocks, before); checkPollDerivedLabel(h, optionText)
    assert(h.field() === current && !h.editor.canUndo && h.transactions.length === 0)
  } finally { h.dispose() }
})
