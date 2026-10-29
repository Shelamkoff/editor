import { createEditor } from '../../../core/index.js'
import { createImagePlugin } from '../../../plugins/image/index.js'
import { createMentionPlugin, createMentionRenderer } from '../../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin, createColorSwatchRenderer } from '../../../inline-plugins/color.js'
import { EditorRenderer } from '../../../renderer/index.js'
import { test, assert, equal, pause } from './harness.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const widgetText = 'Alpha @Ada #123456 tail'

function capturedDefinition(definition, occurrences) {
  return { ...definition, setup(runtimeContext) {
    const runtime = definition.setup(runtimeContext)
    return { ...runtime, create(...args) {
      const instance = Reflect.apply(runtime.create, runtime, args)
      occurrences.push({ instance, context: args.at(-1), element: instance.element, id: typeof args[0] === 'string' ? args[0] : null })
      return instance
    } }
  } }
}

async function fixture({ widgets = true, readOnly = false } = {}) {
  const blocks = [], inline = [], transactions = [], holder = document.createElement('section'), output = document.createElement('section')
  document.body.append(holder, output)
  const caption = widgets ? '<b>Alpha</b> {{mention}} {{swatch}} tail' : '<b>Alpha</b> plain tail'
  const input = { version: '2.0.0', blocks: [{ id: 'image', type: 'image', dataVersion: 1,
    data: { file: { url: pixel, width: 1, height: 1 }, caption, withBorder: false, expanded: false, withBackground: false, styles: {} },
    ...(widgets ? { inline: {
      mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
      swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
    } } : {}),
  }] }
  const untouched = structuredClone(input)
  const editor = createEditor({ holder, injectStyles: false, defaultBlock: 'image', readOnly,
    plugins: [capturedDefinition(createImagePlugin({ injectStyles: false }), blocks)], inlineTools: [],
    inlinePlugins: [capturedDefinition(createMentionPlugin({ searchFunction: async () => [] }), inline), capturedDefinition(createColorSwatchPlugin(), inline)], data: input })
  editor.on('transaction:committed', event => transactions.push(event))
  const current = () => {
    const record = blocks.findLast(item => item.element.isConnected && !item.context.signal.aborted)
    assert(record, 'The actual Image instance must be mounted')
    const caption = record.element.querySelector('.oe-image__caption')
    return { ...record, wrapper: record.element, image: record.element.querySelector('.oe-image__image'), caption, container: caption?.parentNode }
  }
  let closed = false, renderer
  const destroy = () => { if (!closed) { editor.destroy(); closed = true } }
  const dispose = () => { try { renderer?.destroy() } finally { try { destroy() } finally { holder.remove(); output.remove() } } }
  try {
    const mounted = current()
    assert(mounted.image && mounted.caption, 'Use the real Image view nodes')
    await mounted.image.decode()
    await pause(20)
    equal(input, untouched, 'Caller input is unchanged')
    const expected = widgets ? widgetText : 'Alpha plain tail'
    equal(current().caption.textContent, expected, 'Real Mention/Color hydration is a precondition')
    return { editor, current, blocks, inline, transactions, expected, destroy, dispose,
      inlineCurrent: id => inline.findLast(item => item.id === id && item.element.isConnected && !item.context.signal.aborted),
      renderAlt() {
        renderer ??= new EditorRenderer({ blockTypes: ['image'], inlineRenderers: [createMentionRenderer(), createColorSwatchRenderer()] })
        renderer.renderTo(editor.save(), output)
        return output.querySelector('img').alt
      },
    }
  } catch (error) { dispose(); throw error }
}

for (const widgets of [false, true]) test(`Image derived alt after ${widgets ? 'actual Mention and Color' : 'literal'} load`, async () => {
  const h = await fixture({ widgets })
  try {
    const before = h.editor.save().blocks, { image, caption } = h.current()
    equal(h.renderAlt(), h.expected, 'The real renderer provides the same visible alternative text')
    equal(caption.textContent, h.expected)
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.transactions.length === 0)
    equal(image.alt, h.expected, 'Image alt must follow the hydrated visible caption')
  } finally { h.dispose() }
})

for (const readOnly of [false, true]) test(`Image derived alt after mode ${readOnly} to ${!readOnly}`, async () => {
  const h = await fixture({ readOnly })
  try {
    const before = h.editor.save().blocks
    h.editor.setReadOnly(!readOnly)
    await pause(20)
    equal(h.current().caption.textContent, widgetText)
    equal(h.editor.save().blocks, before)
    equal(h.editor.readOnly, !readOnly)
    assert(!h.editor.canUndo && h.transactions.length === 0)
    equal(h.current().image.alt, widgetText, 'Mode rehydration must settle the derived alternative text')
  } finally { h.dispose() }
})

for (const id of ['mention', 'swatch']) test(`Image derived alt follows ${id} data update and exactly one Undo/Redo with selection preserved`, async () => {
  const h = await fixture()
  try {
    const before = h.editor.save().blocks, expected = structuredClone(before)
    if (id === 'mention') expected[0].inline.mention.data.name = 'Grace'
    else expected[0].inline.swatch.data.value = '#654321'
    const text = id === 'mention' ? 'Alpha @Grace #123456 tail' : 'Alpha @Ada #654321 tail'
    const original = h.current(), tail = original.caption.lastChild, selection = window.getSelection()
    assert(tail?.nodeType === Node.TEXT_NODE && tail.textContent === ' tail')
    original.caption.focus(); selection.setBaseAndExtent(tail, 4, tail, 1)
    const selected = selection.toString(), failures = []
    const check = (condition, message) => { if (!condition) failures.push(message) }
    const checkSelection = phase => {
      const current = h.current()
      check(selection.toString() === selected && selection.anchorNode === current.caption.lastChild && selection.anchorOffset === 4
        && selection.focusNode === current.caption.lastChild && selection.focusOffset === 1 && document.activeElement === current.caption,
      `${phase}: exact backward tail range and focus changed ${JSON.stringify({ text: selection.toString(), anchorIsTail: selection.anchorNode === current.caption.lastChild, anchorOffset: selection.anchorOffset, focusIsTail: selection.focusNode === current.caption.lastChild, focusOffset: selection.focusOffset, activeCaption: document.activeElement === current.caption })}`)
    }
    const widget = h.inlineCurrent(id)
    assert(widget, 'Capture the actual registered inline occurrence, not an imitation')
    widget.context.updateData(current => id === 'mention' ? { ...current, name: 'Grace' } : { ...current, value: '#654321' })
    await pause(20)
    equal(h.editor.save().blocks, expected, 'Only the chosen inline payload changes')
    equal(h.transactions.length, 1)
    assert(h.editor.canUndo && !h.editor.canRedo)
    check(h.current().caption === original.caption && h.current().caption.lastChild === tail, 'Update replaced the unrelated caption/tail DOM')
    check(h.current().caption.textContent === text, 'Updated real inline label is missing')
    check(h.current().image.alt === text, 'Update: alt differs from actual caption')
    checkSelection('update')
    h.editor.undo(); await pause(20)
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.editor.canRedo, 'Exactly one Undo restores the accepted predecessor')
    check(h.current().image.alt === widgetText, 'Undo: alt differs from restored caption')
    checkSelection('undo')
    h.editor.redo(); await pause(20)
    equal(h.editor.save().blocks, expected)
    assert(h.editor.canUndo && !h.editor.canRedo)
    equal(h.transactions.length, 3, 'Derived alt adds no authoring or history transactions')
    check(h.current().image.alt === text, 'Redo: alt differs from restored caption')
    checkSelection('redo')
    assert(failures.length === 0, failures.join('\n'))
  } finally { h.dispose() }
})

test('Image derived alt queued before editor disposal cannot write after disposal', async () => {
  const h = await fixture()
  try {
    const old = h.current()
    old.caption.firstChild.firstChild.data = 'Queued change'
    old.image.alt = 'retired image sentinel'
    assert(h.transactions.length === 0 && !h.editor.canUndo)
    h.destroy()
    assert(old.context.signal.aborted, 'Public disposal retires the captured real instance')
    await pause(20)
    equal(old.image.alt, 'retired image sentinel', 'Queued derived work cannot write after disposal')
  } finally { h.dispose() }
})

test('Image derived alt queued before block removal cannot write after its scope aborts', async () => {
  const h = await fixture()
  try {
    const old = h.current(), before = h.editor.save().blocks
    old.caption.firstChild.firstChild.data = 'Queued removal'
    old.image.alt = 'aborted image sentinel'
    h.editor.blocks.remove('image')
    assert(old.context.signal.aborted)
    await pause(20)
    equal(old.image.alt, 'aborted image sentinel')
    const remaining = h.editor.save().blocks
    assert(remaining.length === 1 && remaining[0].id !== 'image' && remaining[0].type === 'image', 'Removing the last block acquires one empty default Image')
    equal(remaining[0].data, createImagePlugin({ injectStyles: false }).schema.createDefault())
    equal(h.transactions.length, 1)
    h.editor.undo(); await pause(20)
    equal(h.editor.save().blocks, before)
    assert(h.current().element !== old.element, 'Undo acquires a distinct live Image occurrence')
    equal(old.image.alt, 'aborted image sentinel', 'A newer occurrence cannot revive the old deferred write')
  } finally { h.dispose() }
})

for (const target of ['image', 'caption']) test(`Image derived alt ignores ${target} moved outside its exact Image view container`, async () => {
  const h = await fixture(), foreign = document.createElement('aside')
  try {
    const old = h.current(), before = h.editor.save().blocks
    // Keeping the displaced caption inside the block avoids introducing a
    // separate core author-field ownership failure into this view-only guard.
    if (target === 'caption') old.wrapper.append(foreign); else document.body.append(foreign)
    old.caption.firstChild.firstChild.data = 'Foreign caption text'
    old.image.alt = 'foreign membership sentinel'
    foreign.append(old[target])
    await pause(20)
    assert(old[target].parentNode === foreign, 'The exact captured view node was moved')
    equal(old.image.alt, 'foreign membership sentinel', 'A source/target outside the owned view container cannot be refreshed')
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.transactions.length === 0)
  } finally { h.dispose(); foreign.remove() }
})
