import { createCompletionFixture } from './field-projection-completion-fixture.js'
import { test, assert, equal, pause, expectError } from './harness.js'
import { dispatchKey, printable } from '../native-input-helpers.js'

const completions = h => h.state.completions.map(item => [item.name, item.key, item.text])
function createSourceFixture() {
  const h = createCompletionFixture({ publicEditor: true })
  h.records[0].data.front += ' tail'
  return h
}
function placeSourceCaret(h) {
  const field = h.panels.get('a').field(), tail = field.lastChild
  assert(tail.nodeType === Node.TEXT_NODE && tail.data === ' tail')
  field.focus(); getSelection().setBaseAndExtent(tail, tail.length, tail, tail.length)
  return { field, tail }
}

test('field source completion trusted same-character replacement completes once without a canonical action', async () => {
  const h = createCompletionFixture({ publicEditor: true })
  try {
    h.mount(); await pause(20)
    const panel = h.panels.get('a'), field = panel.note, tail = field.lastChild
    assert(tail.nodeType === Node.TEXT_NODE && tail.data === ' tail')
    const descriptor = h.state.completions.find(item => item.name === 'a' && item.key === 'note').field
    const before = h.editor.save().blocks, widget = h.latest('a-note'), sibling = h.latest('a-front')
    const inputs = [], notices = []
    field.addEventListener('input', event => inputs.push({ trusted: event.isTrusted, type: event.inputType, data: event.data }), { once: true })
    h.state.completions.length = 0
    h.state.onCompletion = notice => notices.push({ canonical: h.editor.save().blocks, commits: h.state.transactions.length })
    field.focus(); getSelection().setBaseAndExtent(tail, tail.length - 1, tail, tail.length)
    await printable('l')
    equal(inputs, [{ trusted: true, type: 'insertText', data: 'l' }], 'A genuine browser replacement is required')
    equal(h.editor.save().blocks, before)
    equal(completions(h), [['a', 'note', 'Note a-note tail']])
    const completed = h.state.completions[0]
    assert(completed.field === descriptor && completed.element === field && completed.frozen && completed.receiver)
    equal(notices, [{ canonical: before, commits: 0 }])
    equal(h.state.transactions, []); assert(!h.editor.canUndo && !h.editor.canRedo)
    assert(h.panels.get('a').note === field && h.latest('a-note') === widget && h.latest('a-front') === sibling)
    equal(h.state.nativeEdits, [], 'Ordinary author text must not use inline-label reconciliation')
    const native = getSelection()
    assert(native.isCollapsed && field.contains(native.focusNode))
    equal(native.focusOffset, native.focusNode.textContent.length)

    h.state.completions.length = 0; notices.length = 0
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '' }))
    h.editor.blocks.focus('a', { fieldKey: 'note', offset: 'end' })
    equal(h.state.completions, [], 'A later unchanged notification and healthy query cannot replay completion')
    equal(notices, []); equal(h.state.transactions, [])
  } finally { h.dispose() }
})

const observedWidgetTag = 'rector-source-completion-widget'
if (!customElements.get(observedWidgetTag)) customElements.define(observedWidgetTag, class extends HTMLElement {
  static get observedAttributes() { return ['data-inline-plugin', 'data-id'] }
  attributeChangedCallback(name) { this.onProjectionMark?.(name) }
})

test('field source completion native author text settles only its exact field before canonical acceptance', async () => {
  const h = createSourceFixture()
  try {
    h.mount(); await pause(20)
    const { field, tail } = placeSourceCaret(h), before = h.editor.save().blocks
    const widget = h.latest('a-front'), sibling = h.latest('a-note'), notices = [], inputs = []
    h.state.completions.length = 0
    h.state.onCompletion = notice => notices.push({ name: notice.name, key: notice.key,
      canonical: h.editor.save().blocks[0].data.front, commits: h.state.transactions.length })
    field.addEventListener('input', event => inputs.push({ trusted: event.isTrusted, type: event.inputType }), { once: true })
    await printable('X')
    equal(inputs, [{ trusted: true, type: 'insertText' }])
    const after = structuredClone(before); after[0].data.front += 'X'
    equal(h.editor.save().blocks, after)
    equal(completions(h), [['a', 'front', 'Front a-front tailX']])
    equal(notices, [{ name: 'a', key: 'front', canonical: before[0].data.front, commits: 0 }])
    equal(h.panels.get('a').derived.get('front').textContent, 'Front a-front tailX')
    equal(h.state.transactions.length, 1); assert(h.editor.canUndo && !h.editor.canRedo)
    assert(h.panels.get('a').field() === field && field.lastChild === tail)
    assert(h.latest('a-front') === widget && h.latest('a-note') === sibling)
    equal(h.state.nativeEdits, [], 'Ordinary author text must not use inline-label reconciliation')
    assert(getSelection().anchorNode === tail && getSelection().anchorOffset === 6
      && getSelection().focusNode === tail && getSelection().focusOffset === 6)
    h.state.completions.length = 0
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '' }))
    equal(h.state.completions, [], 'A notification without a changed source must not replay completion')
    equal(h.state.transactions.length, 1)
  } finally { h.dispose() }
})

test('field source completion native failure restores accepted content without a history action', async () => {
  const h = createSourceFixture()
  try {
    h.mount(); await pause(20)
    const { field } = placeSourceCaret(h), before = h.editor.save().blocks
    const oldWidget = h.latest('a-front'), attempts = [], inputs = []
    let armed = true
    h.state.onCompletion = notice => {
      if (notice.name !== 'a' || notice.key !== 'front') return
      attempts.push(notice)
      if (armed) { armed = false; throw new Error('controlled source completion failure') }
    }
    field.addEventListener('input', event => inputs.push(event.isTrusted), { once: true })
    expectError(/controlled source completion failure/)
    await printable('X')
    equal(inputs, [true])
    equal(h.editor.save().blocks, before); equal(h.state.transactions, [])
    assert(!h.editor.canUndo && !h.editor.canRedo && h.editor.isReady && !h.editor.readOnly)
    const panel = h.panels.get('a'), currentWidget = h.latest('a-front')
    equal(panel.field().textContent, 'Front a-front tail')
    equal(panel.derived.get('front').textContent, 'Front a-front tail')
    assert(currentWidget !== oldWidget && oldWidget.context.signal.aborted && !currentWidget.context.signal.aborted)
    assert(attempts.length >= 2 && attempts[0].element === field)
    equal(attempts.filter(attempt => attempt.element === field).length, 1, 'The failed occurrence is never retried')
    equal(new Set(attempts.map(attempt => attempt.occurrence)).size, attempts.length,
      'Every completion belongs to a distinct failed or recovered occurrence')
    for (const attempt of attempts.slice(1)) equal(attempt.text, 'Front a-front tail')
    assert(attempts.at(-1).element === panel.field(), 'The final current field receives coherent completion')
    for (const attempt of attempts.slice(0, -1)) {
      assert(attempt.occurrence.context.signal.aborted && !attempt.element.isConnected)
    }
    const count = attempts.length
    for (let index = 0; index < 3; index++) h.editor.blocks.focus('a', { fieldKey: 'front', offset: 'end' })
    await pause(20); equal(attempts.length, count, 'Settled queries cannot replay recovery notifications')
    equal(currentWidget.context.getData(), { label: 'a-front' })
    const task = currentWidget.context.beginTask(); task.cancel()
  } finally { h.dispose() }
})

for (const throws of [false, true]) test(`field source completion rejects ${throws ? 'throwing ' : ''}schema-callback shell adoption before hydration and preserves the foreign shell`, async () => {
  const h = createSourceFixture(), foreign = document.createElement('aside')
  document.body.append(foreign)
  const originalBlock = h.block, originalInline = h.inline, marks = []
  const failure = new Error('controlled map throw after transfer'), errors = []
  const captureError = event => errors.push(event.error)
  window.addEventListener('error', captureError)
  let armed = false, adopted = null, originalPanel = null
  h.block = { ...originalBlock, schema: { ...originalBlock.schema, mapRichText(data, visit) {
    if (armed && data.name === 'a' && data.front === h.records[0].data.front
      && originalPanel.context.getData().front === data.front + 'X') {
      armed = false
      adopted = originalPanel.root.parentNode
      foreign.append(adopted)
      originalPanel.derived.get('front').textContent = 'foreign auxiliary sentinel'
      if (throws) throw failure
    }
    return originalBlock.schema.mapRichText(data, visit)
  } } }
  h.inline = { ...originalInline, setup(runtimeContext) {
    const runtime = originalInline.setup(runtimeContext)
    return { ...runtime, create(id, data, context) {
      const instance = runtime.create(id, data, context)
      const element = runtimeContext.ownerDocument.createElement(observedWidgetTag)
      element.contentEditable = 'false'; element.append(instance.element)
      element.onProjectionMark = name => { if (adopted?.contains(element)) marks.push({ id, name }) }
      h.latest(id).element = element
      return { ...instance, element }
    } }
  } }
  try {
    h.mount(); await pause(20)
    originalPanel = h.panels.get('a')
    const { field, tail } = placeSourceCaret(h), before = h.editor.save().blocks
    const originalWidget = h.latest('a-front'), inputs = [], shell = originalPanel.root.parentNode
    let aborts = 0
    originalPanel.context.signal.addEventListener('abort', () => { aborts++ })
    h.state.completions.length = 0
    field.addEventListener('input', event => inputs.push(event.isTrusted), { once: true })
    armed = true
    expectError(throws ? /Rich-text mapping and ownership validation failed/ : /Field rewrite observation lost its accepted owner/)
    await printable('X')
    equal(inputs, [true]); assert(adopted === shell, 'The public schema callback must actually transfer the source shell')
    equal(errors.length, 1)
    if (throws) {
      assert(errors[0] instanceof AggregateError && errors[0].cause === failure)
      assert(errors[0].errors[0] === failure)
      equal(errors[0].errors[1].message, 'Field rewrite observation lost its accepted owner')
    }
    equal(marks, [], 'Hydration must not write widget markers after the schema callback transfers ownership')
    assert(adopted.parentNode === foreign, 'Recovery removed or reclaimed the adopted foreign shell')
    assert(originalPanel.root.parentNode === adopted && tail.parentNode === field)
    equal(originalPanel.derived.get('front').textContent, 'foreign auxiliary sentinel')
    equal(h.state.completions.filter(item => item.element === field), [], 'The retired field cannot receive completion')
    assert(originalPanel.context.signal.aborted && originalWidget.context.signal.aborted)
    equal(aborts, 1)
    equal(h.state.blockDestroyed.filter(panel => panel === originalPanel).length, 1)
    equal(h.state.destroyed.filter(widget => widget === originalWidget).length, 1)
    equal(h.editor.save().blocks, before); equal(h.state.transactions, [])
    assert(!h.editor.canUndo && !h.editor.canRedo && h.editor.isReady && !h.editor.readOnly)
    const recovered = h.panels.get('a')
    assert(recovered !== originalPanel && recovered.root.isConnected)
    equal(recovered.field().textContent, 'Front a-front tail')
    equal(recovered.derived.get('front').textContent, 'Front a-front tail')
    h.editor.destroy(); h.editor.destroy()
    assert(adopted.parentNode === foreign && originalPanel.root.parentNode === adopted)
    equal(aborts, 1)
    equal(h.state.blockDestroyed.filter(panel => panel === originalPanel).length, 1)
    equal(h.state.destroyed.filter(widget => widget === originalWidget).length, 1)
  } finally { window.removeEventListener('error', captureError); h.dispose(); foreign.remove() }
})

test('field source completion same-key successor receives its own completion after native removal', async () => {
  const h = createCompletionFixture({ publicEditor: true, native: 'remove' })
  h.records[0].data.front = 'L{{a-front}}R'
  h.records[0].inline['a-front'].data.label = 'X'
  const setup = h.block.setup
  let replacement = null, replacements = 0
  h.block = { ...h.block, setup(runtimeContext) {
    const runtime = setup.call(this, runtimeContext)
    return { ...runtime, create(initial, context) {
      const source = runtime.create(initial, context), editableFields = source.editableFields
      source.editableFields = function () {
        const descriptors = editableFields.call(this)
        if (initial.name !== 'a') return descriptors
        if (!replacement && context.getData().front === 'LR') {
          const field = descriptors.find(item => item.key === 'front')
          replacement = field.element.cloneNode(true)
          field.element.replaceWith(replacement)
          h.panels.get('a').field = () => replacement
          h.panels.get('a').derived.get('front').textContent = 'Successor awaits completion'
          replacements++
        }
        return replacement ? descriptors.map(field => field.key === 'front' ? { ...field, element: replacement } : field) : descriptors
      }
      return source
    } }
  } }
  try {
    h.mount(); await pause(20)
    const before = h.editor.save().blocks, field = h.panels.get('a').field(), widget = h.latest('a-front')
    let trusted = false
    field.addEventListener('input', event => { trusted = event.isTrusted }, { once: true })
    field.focus(); getSelection().setBaseAndExtent(widget.element.firstChild, 1, widget.element.firstChild, 1)
    h.state.completions.length = 0
    await dispatchKey('Backspace', 'Backspace', 8)
    assert(trusted, 'This control requires genuine native widget removal')
    equal(replacements, 1)
    const expected = structuredClone(before)
    expected[0].data.front = 'LR'; delete expected[0].inline['a-front']
    equal(h.editor.save().blocks, expected)
    assert(replacement && replacement !== field && replacement.parentNode === h.panels.get('a').root)
    equal(replacement.textContent, 'LR')
    equal(h.state.completions.filter(item => item.name === 'a' && item.key === 'front').map(item => ({
      original: item.element === field, successor: item.element === replacement, text: item.text,
    })), [
      { original: true, successor: false, text: 'LR' },
      { original: false, successor: true, text: 'LR' },
    ], 'A completed old HTMLElement cannot suppress completion of the newly published element under the same key')
    equal(h.panels.get('a').derived.get('front').textContent, 'LR')
    equal(h.state.transactions.length, 1)
  } finally { h.dispose() }
})

test('field source completion rejects author mutation by a schema callback without accepting history', async () => {
  const h = createSourceFixture(), original = h.block.schema.mapRichText
  const beforeText = h.records[0].data.front
  let armed = false, mutations = 0, capturedTail
  h.block = { ...h.block, schema: { ...h.block.schema, mapRichText(data, visit) {
    const instance = h.state.instances.find(item => item.name === 'a')
    if (armed && data.name === 'a' && data.front === beforeText
      && instance?.context.getData().front === beforeText + 'X') {
      armed = false; mutations++
      capturedTail.data = ' SCHEMA MUTATION'
    }
    return original.call(this, data, visit)
  } } }
  try {
    h.mount(); await pause(20)
    const before = h.editor.save().blocks, { field, tail } = placeSourceCaret(h)
    const oldWidget = h.latest('a-front'), inputs = []
    capturedTail = tail
    field.addEventListener('input', event => inputs.push(event.isTrusted), { once: true })
    h.state.completions.length = 0; armed = true
    expectError(/Rich-text mapping changed author content/)
    await printable('X')
    equal(inputs, [true]); equal(mutations, 1, 'The actual native source projection must invoke the controlled schema callback')
    equal(h.editor.save().blocks, before); equal(h.state.transactions, [])
    equal(h.state.completions.filter(item => item.element === field), [], 'Corrupted author DOM must never receive completion')
    assert(!h.editor.canUndo && !h.editor.canRedo && h.editor.isReady && !h.editor.readOnly)
    assert(h.panels.get('a').field() !== field && oldWidget.context.signal.aborted)
    equal(h.panels.get('a').field().textContent, 'Front a-front tail')
    equal(h.panels.get('a').derived.get('front').textContent, 'Front a-front tail')
    assert(!field.isConnected)
  } finally { h.dispose() }
})
