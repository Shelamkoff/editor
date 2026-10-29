import { createPersonPlugin } from '../../../plugins/person/index.js'
import { createMentionPlugin, createMentionRenderer } from '../../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin, createColorSwatchRenderer } from '../../../inline-plugins/color.js'
import { EditorRenderer } from '../../../renderer/index.js'
import { test, assert, equal, pause, make, blockElement } from './harness.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const richName = '<b>Alpha</b> <i>{{mention}}</i> <mark>{{swatch}}</mark> tail'
const visibleName = 'Alpha @Ada #123456 tail'
const person = (id, name = '') => ({ id, avatar: '', name, role: '', bio: '', links: [] })
const sidecars = () => ({
  mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
  swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
})

function capture(definition, occurrences, completions) {
  return { ...definition, setup(runtimeContext) {
    const runtime = definition.setup(runtimeContext)
    return { ...runtime, create(...args) {
      const instance = Reflect.apply(runtime.create, runtime, args)
      occurrences.push({ instance, context: args.at(-1), element: instance.element,
        id: typeof args[0] === 'string' ? args[0] : null })
      if (completions) {
        const afterProjection = instance.afterProjection
        instance.afterProjection = function (field) {
          completions.push(field)
          return afterProjection?.call(this, field)
        }
      }
      return instance
    } }
  } }
}

async function fixture({ profiles = [person('active', richName), person('other', 'Grace')], widgets = true, locale } = {}) {
  const instances = [], inline = [], completions = [], transactions = []
  const input = { id: 'person', type: 'person', dataVersion: 2, data: { persons: profiles },
    ...(widgets ? { inline: sidecars() } : {}) }
  const beforeInput = structuredClone(input)
  const editor = make([input], { defaultBlock: 'person', inlineTools: [], ...(locale ? { locale } : {}),
    plugins: [capture(createPersonPlugin({ injectStyles: false }), instances, completions)],
    inlinePlugins: [capture(createMentionPlugin({ searchFunction: async () => [] }), inline), capture(createColorSwatchPlugin(), inline)],
  })
  editor.on('transaction:committed', event => transactions.push(event))
  await pause(20)
  equal(input, beforeInput, 'Construction mutated the supplied profile or sidecar input')
  const current = () => {
    const occurrence = instances.findLast(item => item.element.isConnected && !item.context.signal.aborted)
    assert(occurrence, 'The real Person occurrence must remain mounted')
    return occurrence
  }
  return { editor, current, completions, transactions,
    name: () => blockElement(editor, 'person').querySelector('.oe-person__name'),
    label: id => blockElement(editor, 'person').querySelector(`[data-person-id="${id}"] .oe-person__tab-label`),
    widget: id => inline.findLast(item => item.id === id && item.element.isConnected && !item.context.signal.aborted),
    dispose: () => editor.destroy(),
  }
}

function backwardTail(h) {
  const field = h.name(), tail = field.lastChild, selection = getSelection()
  assert(tail?.nodeType === Node.TEXT_NODE && tail.data === ' tail', 'Actual trailing author text is required')
  field.focus(); selection.setBaseAndExtent(tail, 4, tail, 1)
  return { field, tail, selection, text: selection.toString() }
}
function retainedRange(h, before) {
  return { field: h.name() === before.field, tail: h.name().lastChild === before.tail,
    active: document.activeElement === before.field, text: before.selection.toString(),
    anchor: before.selection.anchorNode === before.tail, anchorOffset: before.selection.anchorOffset,
    focus: before.selection.focusNode === before.tail, focusOffset: before.selection.focusOffset }
}
const expectedRange = text => ({ field: true, tail: true, active: true, text,
  anchor: true, anchorOffset: 4, focus: true, focusOffset: 1 })

for (const localized of [false, true]) test(`Person derived fallback labels interpolate ordinal with ${localized ? 'a locale' : 'no plugin locale'}`, async () => {
  const h = await fixture({ widgets: false, profiles: [person('active'), person('other')],
    ...(localized ? { locale: { 'plugin.person.fallbackName': 'Profile {number}' } } : {}) })
  try {
    const before = h.editor.save().blocks
    equal(['active', 'other'].map(id => h.label(id).textContent), localized ? ['Profile 1', 'Profile 2'] : ['Person 1', 'Person 2'])
    h.editor.setReadOnly(true)
    equal(['active', 'other'].map(id => h.label(id).textContent), localized ? ['Profile 1', 'Profile 2'] : ['Person 1', 'Person 2'])
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.transactions.length === 0)
  } finally { h.dispose() }
})

test('Person derived active tab follows actual widgets through initial projection and both modes', async () => {
  const h = await fixture(), observed = []
  try {
    const before = h.editor.save().blocks
    for (const mode of [false, true, false]) {
      if (h.editor.readOnly !== mode) h.editor.setReadOnly(mode)
      await pause(20)
      equal(h.name().textContent, visibleName, 'The real name field must be fully hydrated')
      observed.push(h.label('active').textContent)
      equal(h.editor.save().blocks, before)
    }
    assert(!h.editor.canUndo && h.transactions.length === 0)
    equal(observed, [visibleName, visibleName, visibleName], 'The completed name was not reflected in its active tab')
  } finally { h.dispose() }
})

for (const id of ['mention', 'swatch']) test(`Person derived active tab follows actual ${id} payload update and one Undo/Redo`, async () => {
  const h = await fixture(), observed = []
  try {
    const before = h.editor.save().blocks, after = structuredClone(before), range = backwardTail(h)
    if (id === 'mention') after[0].inline.mention.data.name = 'Grace'
    else after[0].inline.swatch.data.value = '#654321'
    const changedName = id === 'mention' ? 'Alpha @Grace #123456 tail' : 'Alpha @Ada #654321 tail'
    h.widget(id).context.updateData(data => id === 'mention' ? { ...data, name: 'Grace' } : { ...data, value: '#654321' })
    equal(h.editor.save().blocks, after)
    equal(retainedRange(h, range), expectedRange(range.text), 'The payload edit moved the native backward selection')
    observed.push(h.label('active').textContent)
    assert(h.editor.canUndo && !h.editor.canRedo)
    assert(h.editor.undo())
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.editor.canRedo)
    observed.push(h.label('active').textContent)
    assert(h.editor.redo())
    equal(h.editor.save().blocks, after)
    assert(h.editor.canUndo && !h.editor.canRedo)
    observed.push(h.label('active').textContent)
    equal(h.transactions.length, 3, 'Derived presentation created an extra document/history action')
    equal(observed, [changedName, visibleName, changedName])
  } finally { h.dispose() }
})

for (const action of ['sibling edit', 'reorder']) test(`Person derived active tab and backward range survive unrelated ${action} without new field completion`, async () => {
  const h = await fixture()
  try {
    const before = h.editor.save().blocks, after = structuredClone(before), range = backwardTail(h)
    const oldWidgets = [h.widget('mention'), h.widget('swatch')]
    if (action === 'sibling edit') after[0].data.persons[1].role = 'Reviewer'
    else after[0].data.persons.reverse()
    h.completions.length = 0
    h.editor.blocks.update('person', current => ({ data: { ...current.data, persons: after[0].data.persons } }))
    equal(h.editor.save().blocks, after, 'Only the requested sibling/order data may change')
    equal({ range: retainedRange(h, range), label: h.label('active').textContent,
      completions: h.completions.map(field => field.key),
      widgets: oldWidgets.map(widget => h.widget(widget.id) === widget),
    }, { range: expectedRange(range.text), label: visibleName, completions: [], widgets: [true, true] },
    'Unchanged active author presentation must remain live without a new completion callback')
    equal(h.transactions.length, 1)
    assert(h.editor.undo())
    equal(h.editor.save().blocks, before)
    assert(!h.editor.canUndo && h.editor.canRedo)
  } finally { h.dispose() }
})

test('Person derived tab settles a previously hidden widget name when its actual field is focused', async () => {
  const h = await fixture({ profiles: [person('active', 'Grace'), person('other', richName)] })
  try {
    const before = h.editor.save().blocks, previous = h.name()
    assert(h.editor.blocks.focus('person', { fieldKey: 'person:other:name', offset: 'end' }))
    await pause(20)
    assert(h.name() !== previous && !previous.isConnected)
    equal(h.name().textContent, visibleName)
    equal(h.label('other').textContent, visibleName, 'Mounted hidden profile did not receive its completed derived name')
    equal(h.editor.save().blocks, before)
    assert(h.transactions.length === 0 && !h.editor.canUndo)
  } finally { h.dispose() }
})

test('Person derived input from a retired body leaves the current tab and author fields unchanged', async () => {
  const h = await fixture()
  try {
    const old = h.name()
    h.editor.setReadOnly(true)
    const before = h.editor.save().blocks, label = h.label('active').textContent, current = h.name()
    assert(!old.isConnected && old !== current)
    old.textContent = 'retired name'
    old.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'retired' }))
    old.dispatchEvent(new FocusEvent('blur'))
    await pause(20)
    equal(h.editor.save().blocks, before)
    equal(h.label('active').textContent, label)
    assert(h.name() === current && !h.editor.canUndo && h.transactions.length === 0)
  } finally { h.dispose() }
})

test('Person derived completion cannot write a tab label adopted by another container', async () => {
  const h = await fixture(), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    const label = h.label('active')
    foreign.append(label); label.textContent = 'foreign label sentinel'
    h.widget('mention').context.updateData(data => ({ ...data, name: 'Grace' }))
    equal(h.name().textContent, 'Alpha @Grace #123456 tail')
    assert(label.parentNode === foreign)
    equal(label.textContent, 'foreign label sentinel')
  } finally { h.dispose(); foreign.remove() }
})

test('Person derived input cannot write from a name adopted by another container', async () => {
  const h = await fixture(), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    const name = h.name(), label = h.label('active')
    foreign.append(name); label.textContent = 'owned label sentinel'
    name.textContent = 'foreign name'
    name.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'foreign' }))
    await pause(20)
    equal(label.textContent, 'owned label sentinel')
    assert(name.parentNode === foreign)
    assert(h.transactions.length === 0)
  } finally { h.dispose(); foreign.remove() }
})

for (const widgets of [false, true]) test(`Person renderer derives ${widgets ? 'real widget' : 'literal entity'} avatar alternatives from one parsed name per owning document`, async () => {
  const name = widgets ? richName : '<b>Alpha &lt;b&gt;literal&lt;/b&gt;</b> &amp; {{literal}} &amp;lt;twice&amp;gt;'
  const expected = widgets ? visibleName : 'Alpha <b>literal</b> & {{literal}} &lt;twice&gt;'
  const data = { version: '2.0.0', blocks: [{ id: 'person', type: 'person', dataVersion: 2,
    data: { persons: [{ ...person('active', name), avatar: pixel }] }, ...(widgets ? { inline: sidecars() } : {}) }] }
  const before = structuredClone(data), calls = []
  const inlineRenderers = [createMentionRenderer(), createColorSwatchRenderer()].map(definition => ({ ...definition,
    render(id, payload, context) {
      calls.push({ id, ownerDocument: context.ownerDocument })
      return definition.render(id, payload, context)
    },
  }))
  const renderer = new EditorRenderer({ blockTypes: ['person'], injectStyles: false, inlineRenderers })
  const frame = document.createElement('iframe'), target = document.createElement('section')
  frame.src = 'about:blank'
  const ready = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }))
  document.body.append(frame, target)
  let detached, foreign
  const inspect = (root, ownerDocument) => {
    const card = root.querySelector('.editor-person__card')
    assert(card && card.ownerDocument === ownerDocument)
    equal(card.querySelector('.editor-person__name').textContent, expected)
    equal(card.querySelector('.editor-person__avatar-img').alt, expected)
    equal(calls.map(call => ({ id: call.id, document: call.ownerDocument === ownerDocument })),
      widgets ? [{ id: 'mention', document: true }, { id: 'swatch', document: true }] : [], 'The alternative text must reuse the same parsed name')
  }
  try {
    await ready
    detached = renderer.render(data); inspect(detached, document)
    assert(!detached.isConnected)
    target.append(detached); inspect(detached, document)
    renderer.destroy(detached); detached.remove()
    calls.length = 0; renderer.renderTo(data, target); inspect(target, document)
    foreign = frame.contentDocument.createElement('section'); frame.contentDocument.body.append(foreign)
    calls.length = 0; renderer.renderTo(data, foreign); inspect(foreign, frame.contentDocument)
    equal(data, before, 'Rendering must not modify author data or sidecars')
  } finally {
    renderer.destroy()
    equal([detached?.childNodes.length ?? 0, target.childNodes.length, foreign?.childNodes.length ?? 0], [0, 0, 0])
    detached?.remove(); target.remove(); frame.remove()
  }
})
