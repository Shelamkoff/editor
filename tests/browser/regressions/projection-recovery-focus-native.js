import { createCarouselPlugin } from '../../../plugins/carousel/index.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { test, make, para, blockElement, editorRoot, editorHolder, pause, equal, assert } from './harness.js'
import { clickNative, dispatchKey, printable } from '../native-input-helpers.js'
import { getTextOffset } from '../../../shared/textOffset.js'

test('Projection recovery keeps native keyboard history after a focused Carousel source fails', async () => {
  const added = { id: 'delta', type: 'html', html: '<p>Delta</p>', caption: 'Delta' }
  const failure = new Error('controlled Carousel projection failure')
  const scopes = [], sourceSignals = [], failures = [], transactions = [], shortcuts = []
  let projected = false
  const base = createCarouselPlugin({ actions: [{ label: 'Append failing slide', handler: async ({ signal }) => {
    sourceSignals.push(signal)
    return [added]
  } }] })
  const definition = { ...base, setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return { ...runtime, create(initial, context) {
      scopes.push(context.signal)
      const instance = runtime.create(initial, { ...context, beginTask() {
        const task = context.beginTask()
        return { ...task, commit(...args) {
          try { return task.commit(...args) }
          catch (error) { failures.push(error); throw error }
        } }
      } })
      return { ...instance, update(next, previous) {
        instance.update(next, previous)
        if (!projected && next.slides.some(slide => slide.id === 'delta')) {
          projected = instance.read().slides.some(slide => slide.id === 'delta')
          throw failure
        }
      } }
    } }
  } }
  const supplied = [para('before', 'Before'), { id: 'carousel', type: 'carousel', dataVersion: 1, data: {
    slides: [
      { id: 'alpha', type: 'html', html: '<p>Alpha</p>', caption: 'Alpha' },
      { id: 'bravo', type: 'html', html: '<p>Bravo</p>', caption: 'Bravo' },
    ], options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false },
  } }, para('after', 'After')]
  const original = structuredClone(supplied)
  const editor = make(supplied, { plugins: [createParagraphPlugin(), definition], injectStyles: true })
  editorHolder(editor).style.width = '640px'
  editor.on('transaction:committed', event => transactions.push(event))
  const root = () => blockElement(editor, 'carousel')
  const field = () => root().querySelector('.oe-carousel-block__caption')
  const button = text => [...root().querySelectorAll('button')].find(element => element.textContent.trim() === text)
  const before = editor.save().blocks, oldRoot = root()
  const beforeNeighbor = blockElement(editor, 'before'), afterNeighbor = blockElement(editor, 'after')
  const observeKey = event => {
    if (event.key.toLowerCase() === 'z') shortcuts.push({ trusted: event.isTrusted,
      tag: event.target.tagName, insideEditor: editorRoot(editor).contains(event.target) })
  }
  document.addEventListener('keydown', observeKey, true)
  try {
    await clickNative(field())
    await dispatchKey('End', 'End', 35)
    await printable('X')
    const edited = structuredClone(before); edited[1].data.slides[0].caption = 'AlphaX'
    equal(editor.save().blocks, edited)
    await clickNative(button('Add'))
    await clickNative(button('Append failing slide'))
    await pause(30)
    assert(projected, 'The fault must follow the real Carousel projection')
    assert(failures.length === 1 && failures[0] === failure, 'Recovery must retain the original failure')
    equal(editor.save().blocks, edited, 'Rejected projection changed accepted data')
    assert(!oldRoot.isConnected && scopes.length === 2 && scopes[0].aborted && !scopes[1].aborted,
      'Recovery must retire the damaged owner and mount a fresh live occurrence')
    assert(sourceSignals.length === 1 && sourceSignals[0].aborted, 'Rejected source task remains live')
    assert(blockElement(editor, 'before') === beforeNeighbor && blockElement(editor, 'after') === afterNeighbor)
    equal(transactions.length, 1, 'Rejected projection published an accepted action')
    equal([editor.canUndo, editor.canRedo], [true, false])
    const recoveredFocus = { tag: document.activeElement.tagName, className: document.activeElement.className,
      insideEditor: editorRoot(editor).contains(document.activeElement) }
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before,
      'Recovered authoring lost native Undo ownership: ' + JSON.stringify({ recoveredFocus, shortcuts }))
    equal([editor.canUndo, editor.canRedo], [false, true])
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, edited)
    equal([editor.canUndo, editor.canRedo], [true, false])
    equal(transactions.length, 3)
    assert(shortcuts.length === 2 && shortcuts.every(event => event.trusted && event.insideEditor))
    equal(supplied, original)
  } finally {
    document.removeEventListener('keydown', observeKey, true)
  }
})

function recoveryEditor({ onFailure, onRetire } = {}) {
  const failure = new Error('controlled Carousel recovery control')
  const scopes = [], transactions = []
  let failed = false
  const base = createCarouselPlugin()
  const definition = { ...base, setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return { ...runtime, create(initial, context) {
      const first = scopes.length === 0
      scopes.push(context.signal)
      const instance = runtime.create(initial, context)
      return { ...instance,
        update(next, previous) {
          instance.update(next, previous)
          if (!failed && next.slides.some(slide => slide.id === 'delta')) {
            failed = true
            onFailure?.()
            throw failure
          }
        },
        destroy() { instance.destroy(); if (first && failed) onRetire?.() },
      }
    } }
  } }
  const supplied = [{ id: 'carousel', type: 'carousel', dataVersion: 1, data: {
    slides: [{ id: 'alpha', type: 'html', html: '<p>Alpha</p>', caption: 'Alpha' }],
    options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false },
  } }, para('neighbor', 'After')]
  const original = structuredClone(supplied)
  const editor = make(supplied, { plugins: [createParagraphPlugin(), definition], injectStyles: true })
  editorHolder(editor).style.width = '640px'
  editor.on('transaction:committed', event => transactions.push(event))
  const root = () => blockElement(editor, 'carousel')
  const field = () => root().querySelector('.oe-carousel-block__caption')
  const before = editor.save().blocks, oldRoot = root(), neighbor = blockElement(editor, 'neighbor')
  const edited = structuredClone(before); edited[0].data.slides[0].caption = 'AlphaX'
  return { editor, field, before, edited, transactions,
    async type() {
      await clickNative(field()); await dispatchKey('End', 'End', 35); await printable('X')
      equal(editor.save().blocks, edited)
    },
    focusControl() {
      const button = [...root().querySelectorAll('button')].find(element => element.textContent.trim() === 'Add')
      button.focus()
      assert(document.activeElement === button)
    },
    reject() {
      let caught
      try { editor.blocks.update('carousel', current => ({ data: { ...current.data,
        slides: [...current.data.slides, { id: 'delta', type: 'html', html: '<p>Delta</p>', caption: 'Delta' }],
      } })) } catch (error) { caught = error }
      assert(caught === failure, 'Recovery changed the original entered failure: ' + String(caught))
      assert(failed && !oldRoot.isConnected && scopes.length === 2 && scopes[0].aborted && !scopes[1].aborted)
      assert(blockElement(editor, 'neighbor') === neighbor)
      equal(editor.save().blocks, edited)
      equal(transactions.length, 1)
      equal([editor.canUndo, editor.canRedo], [true, false])
      equal(supplied, original)
    },
  }
}

test('Projection recovery leaves another editor native focus and history unchanged', async () => {
  const h = recoveryEditor()
  await h.type()
  const other = make([para('other', 'Foreign')])
  const field = blockElement(other, 'other').querySelector('[contenteditable="true"]')
  const before = other.save().blocks
  await clickNative(field); await dispatchKey('End', 'End', 35); await printable('Q')
  const edited = structuredClone(before); edited[0].data.text = 'ForeignQ'
  equal(other.save().blocks, edited)
  h.reject()
  assert(document.activeElement === field, 'Recovery stole an existing foreign editing focus')
  equal(getTextOffset(field, getSelection().anchorNode, getSelection().anchorOffset), 8)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(other.save().blocks, before); equal(h.editor.save().blocks, h.edited)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(other.save().blocks, edited); equal(h.editor.save().blocks, h.edited)
})

test('Projection recovery preserves newer foreign focus selected during the rejected projection', async () => {
  const other = make([para('other', 'Foreign')])
  const field = blockElement(other, 'other').querySelector('[contenteditable="true"]')
  const h = recoveryEditor({ onFailure() {
    field.focus()
    getSelection().setBaseAndExtent(field.firstChild, 2, field.firstChild, 2)
  } })
  await h.type(); h.focusControl(); h.reject()
  assert(document.activeElement === field, 'Recovery overrode a newer live foreign focus')
  equal(getTextOffset(field, getSelection().anchorNode, getSelection().anchorOffset), 2)
  await printable('Q')
  equal(other.save().blocks[0].data.text, 'FoQreign')
  equal(h.editor.save().blocks, h.edited)
})

test('Projection recovery preserves newer live neighbor focus from retired-owner cleanup', async () => {
  let selected
  const h = recoveryEditor({ onRetire() {
    selected = blockElement(h.editor, 'neighbor').querySelector('[contenteditable="true"]')
    selected.focus()
    getSelection().setBaseAndExtent(selected.firstChild, 2, selected.firstChild, 2)
  } })
  await h.type(); h.focusControl(); h.reject()
  assert(document.activeElement === selected, 'Recovery overrode a newer live neighbor focus')
  equal(getTextOffset(selected, getSelection().anchorNode, getSelection().anchorOffset), 2)
  await printable('Q')
  equal(h.editor.save().blocks[1].data.text, 'AfQter')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(h.editor.save().blocks, h.edited)
})

test('Projection recovery retains existing backward keyed selection and native history restoration', async () => {
  const h = recoveryEditor()
  await h.type()
  const text = h.field().firstChild
  getSelection().setBaseAndExtent(text, 5, text, 2)
  h.reject()
  const field = h.field(), selection = getSelection()
  assert(document.activeElement === field)
  equal([getTextOffset(field, selection.anchorNode, selection.anchorOffset),
    getTextOffset(field, selection.focusNode, selection.focusOffset)], [5, 2])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(h.editor.save().blocks, h.before)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(h.editor.save().blocks, h.edited)
  assert(document.activeElement === h.field())
  equal(getTextOffset(h.field(), getSelection().anchorNode, getSelection().anchorOffset), 6)
})

test('Projection recovery fieldless bookmark keeps a newer foreign focus after its single restoration', async () => {
  const failure = new Error('controlled fieldless projection failure')
  const definition = { type: 'recovery-control', label: { key: 'recoveryControl', fallback: 'Recovery control' }, icon: '', schema: createParagraphPlugin().schema,
    setup() { return { create(initial, context) {
      let data = { ...initial }
      const element = context.ownerDocument.createElement('div')
      element.contentEditable = 'false'
      const button = context.ownerDocument.createElement('button')
      button.textContent = initial.text
      element.append(button)
      return { element, read: () => ({ ...data }), setReadOnly() {}, destroy() {},
        update(next) { data = { ...next }; element.textContent = next.text; throw failure },
      }
    }, destroy() {} } },
  }
  const editor = make([{ id: 'control', type: definition.type, dataVersion: 2, data: { text: 'Alpha' } }],
    { plugins: [definition], defaultBlock: definition.type })
  const foreign = document.createElement('input')
  foreign.value = 'Foreign'
  document.body.append(foreign)
  const before = editor.save().blocks, oldRoot = blockElement(editor, 'control')
  let redirects = 0
  const redirect = event => {
    if (redirects || oldRoot.isConnected || !editorRoot(editor).contains(event.target)) return
    redirects++
    foreign.focus()
    foreign.setSelectionRange(2, 2)
  }
  try {
    await clickNative(oldRoot.querySelector('button'))
    document.addEventListener('focusin', redirect, true)
    let caught
    try { editor.blocks.update('control', () => ({ data: { text: 'Beta' } })) }
    catch (error) { caught = error }
    assert(caught === failure, 'Projection did not propagate its original failure: ' + String(caught))
    equal(editor.save().blocks, before)
    equal([editor.canUndo, editor.canRedo], [false, false])
    equal(redirects, 1)
    assert(document.activeElement === foreign,
      'A second restoration stole the newer foreign focus: ' + document.activeElement.outerHTML)
    equal([foreign.selectionStart, foreign.selectionEnd], [2, 2])
  } finally {
    document.removeEventListener('focusin', redirect, true)
    foreign.remove()
  }
})
