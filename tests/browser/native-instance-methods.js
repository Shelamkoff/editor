import { createEditor } from '../../core/index.js'

import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { test, make, blockElement, equal, assert, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'

function member(reads, name, method, decorated) {
  reads[name] = (reads[name] ?? 0) + 1
  if (!decorated && reads[name] > 1) throw new Error(name + ' instance getter reread')
  if (decorated) Object.defineProperty(method, 'bind', { get() { throw new Error(name + ' callback bind accessed') } })
  return method
}
for (const decorated of [false, true]) test('Inline instance captures ' + (decorated ? 'decorated functions' : 'method getters') + ' once with private receiver', async () => {
  const created = []
  const definition = {
    type: 'badge', icon: '', label: { key: 'title', fallback: 'Badge' },
    schema: { currentVersion: 1, createDefault: () => ({ name: 'Ada' }), encode: data => ({ dataVersion: 1, data }), decode: input => input },
    setup(runtime) {
      return {
        create(_id, data, context) {
          const reads = {}, state = { disposed: 0 }, element = runtime.ownerDocument.createElement('button')
          element.type = 'button'; element.textContent = data.name
          element.addEventListener('click', () => context.updateData(current => ({ name: current.name + '!' })), { signal: context.signal })
          class Widget {
            #element = element
            #state = state
            get element() { reads.element = (reads.element ?? 0) + 1; return this.#element }
            get update() { return member(reads, 'update', function(next) { this.#element.textContent = next.name }, decorated) }
            get setReadOnly() { return member(reads, 'setReadOnly', function(value) { this.#element.disabled = value }, decorated) }
            get focus() { return member(reads, 'focus', function() { this.#element.focus() }, decorated) }
            get destroy() { return member(reads, 'destroy', function() { this.#state.disposed++ }, decorated) }
          }
          const source = new Widget()
          created.push({ source, reads, state, element })
          return source
        },
        destroy() {},
      }
    },
  }
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{w_badge}}' }, inline: { w_badge: { type: 'badge', dataVersion: 1, data: { name: 'Ada' } } } }], { inlinePlugins: [definition] })
  const first = created[0]
  equal(first.reads, { element: 1, update: 1, setReadOnly: 1, focus: 1, destroy: 1 })
  for (const key of ['update', 'setReadOnly', 'focus', 'destroy']) Object.defineProperty(first.source, key, { value() { throw new Error('Later instance method used') } })
  editor.setReadOnly(true); equal(first.element.disabled, true)
  editor.setReadOnly(false); equal(first.element.disabled, false)
  const before = editor.save().blocks
  await clickNative(first.element)
  equal(Object.values(editor.save().blocks[0].inline)[0].data, { name: 'Ada!' })
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(Object.values(editor.save().blocks[0].inline)[0].data, { name: 'Ada!' })
  editor.destroy(); editor.destroy()
  for (const entry of created) {
    equal(entry.reads, { element: 1, update: 1, setReadOnly: 1, focus: 1, destroy: 1 })
    equal(entry.state.disposed, 1)
  }
})

for (const decorated of [false, true]) test('Block instance captures ' + (decorated ? 'decorated functions' : 'method getters') + ' once and preserves native input', async () => {
  const created = [], paragraph = createParagraphPlugin()
  const definition = { ...paragraph, setup(runtime) {
    const base = paragraph.setup(runtime)
    return {
      create(data, context) {
        const inner = base.create(data, context), reads = {}, state = { disposed: 0 }
        class Block {
          #inner = inner
          #state = state
          get element() { reads.element = (reads.element ?? 0) + 1; return this.#inner.element }
          get read() { return member(reads, 'read', function() { return this.#inner.read() }, decorated) }
          get update() { return member(reads, 'update', function(next, previous) { this.#inner.update(next, previous) }, decorated) }
          get editableFields() { return member(reads, 'editableFields', function() { return this.#inner.editableFields() }, decorated) }
          get setReadOnly() { return member(reads, 'setReadOnly', function(value) { this.#inner.setReadOnly(value) }, decorated) }
          get focus() { return member(reads, 'focus', function(options) { this.#inner.focus(options) }, decorated) }
          get destroy() { return member(reads, 'destroy', function() { this.#state.disposed++; this.#inner.destroy() }, decorated) }
        }
        const source = new Block(); created.push({ source, reads, state }); return source
      },
      destroy() { base.destroy() },
    }
  } }
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } }], { plugins: [definition] })
  const expected = { element: 1, read: 1, update: 1, editableFields: 1, setReadOnly: 1, focus: 1, destroy: 1 }
  equal(created[0].reads, expected)
  for (const key of Object.keys(expected).filter(key => key !== 'element')) Object.defineProperty(created[0].source, key, { value() { throw new Error('Later block instance method used') } })
  editor.setReadOnly(true)
  equal(blockElement(editor, 'a').querySelector('.oe-paragraph').contentEditable, 'false')
  editor.setReadOnly(false)
  const before = editor.save().blocks
  editor.blocks.focus('a', { offset: 2 })
  await printable('X')
  equal(editor.save().blocks[0].data.text, 'AlXpha')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks[0].data.text, 'AlXpha')
  editor.destroy(); editor.destroy()
  for (const entry of created) { equal(entry.reads, expected); equal(entry.state.disposed, 1) }
})


for (const kind of ['block', 'inline']) test('Rejected ' + kind + ' instance releases its captured disposer once', () => {
  let reads = 0, disposed = 0, signal
  const paragraph = createParagraphPlugin()
  const create = context => {
    signal = context.signal
    return {
      element: document.createElement('span'),
      get destroy() {
        if (++reads > 1) throw new Error('Rejected instance destroy getter reread')
        return function() { disposed++ }
      },
    }
  }
  const badge = {
    type: 'badge', icon: '', label: { key: 'title', fallback: 'Badge' },
    schema: { currentVersion: 1, createDefault: () => ({ name: 'Ada' }), encode: data => ({ dataVersion: 1, data }), decode: input => input },
    setup() { return { create(_id, _data, context) { return create(context) }, destroy() {} } },
  }
  const invalidBlock = { ...paragraph, setup() { return { create(_data, context) { return create(context) }, destroy() {} } } }
  let error
  try {
    make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: '{{w_badge}}' }, inline: { w_badge: { type: 'badge', dataVersion: 1, data: { name: 'Ada' } } } }],
      { plugins: [kind === 'block' ? invalidBlock : paragraph], inlinePlugins: kind === 'inline' ? [badge] : [] })
  } catch (caught) { error = caught }
  assert(error && /invalid.*instance/.test(error.message), 'Invalid instance was accepted')
  equal([reads, disposed, signal.aborted], [1, 1, true])
  assert(!document.querySelector('.oe-editor'), 'Failed creation retained an editor root')
})

test('Rejected inline runtime releases captured resources and allows restarting the holder', async () => {
  const holder = document.createElement('section'), original = document.createElement('p')
  original.textContent = 'Host content'; holder.append(original); document.body.append(holder)
  const panel = document.createElement('aside')
  let destroyReads = 0, disposed = 0, received = 0, signal, restarted
  const onProbe = () => received++
  const definition = {
    type: 'badge', icon: '', label: { key: 'title', fallback: 'Badge' },
    schema: { currentVersion: 1, createDefault: () => ({ name: 'Ada' }), encode: data => ({ dataVersion: 1, data }), decode: input => input },
    setup(context) {
      signal = context.signal
      document.body.append(panel)
      document.addEventListener('runtime-cleanup-probe', onProbe)
      class Runtime {
        #panel = panel
        create() { throw new Error('Rejected runtime must not create a widget') }
        get destroy() {
          if (++destroyReads > 1) throw new Error('Runtime destroy getter reread')
          return function() { disposed++; this.#panel.remove(); document.removeEventListener('runtime-cleanup-probe', onProbe) }
        }
        onTriggerCancel = 42
      }
      return new Runtime()
    },
  }
  try {
    let error
    try { createEditor({ holder, injectStyles: false, plugins: [createParagraphPlugin()], inlinePlugins: [definition] }) }
    catch (caught) { error = caught }
    assert(error instanceof TypeError && /onTriggerCancel/.test(error.message), 'Runtime validation error was lost')
    document.dispatchEvent(new Event('runtime-cleanup-probe'))
    equal([destroyReads, disposed, received, signal.aborted, panel.isConnected], [1, 1, 0, true, false])
    assert(holder.childNodes.length === 1 && holder.firstChild === original, 'Failed creation lost host content')
    restarted = createEditor({ holder, injectStyles: false, plugins: [createParagraphPlugin()], data: { version: '2.0.0', blocks: [{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } }] } })
    restarted.blocks.focus('a', { offset: 2 })
    await printable('X')
    equal(restarted.save().blocks[0].data.text, 'AlXpha')
  } finally {
    restarted?.destroy(); holder.remove(); panel.remove()
    document.removeEventListener('runtime-cleanup-probe', onProbe)
  }
})

test('Owned widget shortcuts undo author changes while nested inputs retain their native Undo', async () => {
  const definition = {
    type: 'badge', icon: '', label: { key: 'title', fallback: 'Badge' },
    schema: { currentVersion: 1, createDefault: () => ({ name: 'Open' }), encode: data => ({ dataVersion: 1, data }), decode: input => input },
    setup(runtime) {
      return {
        create(_id, data, context) {
          const widget = runtime.ownerDocument.createElement('span'), input = runtime.ownerDocument.createElement('input'), button = runtime.ownerDocument.createElement('button')
          widget.dataset.inlinePlugin = 'badge'; widget.contentEditable = 'false'; widget.tabIndex = 0
          input.type = 'text'; input.value = 'Draft'; button.type = 'button'; button.textContent = data.name
          button.addEventListener('click', () => context.updateData(current => ({ name: current.name + '!' })), { signal: context.signal })
          widget.append(input, button)
          return { element: widget, update(next) { button.textContent = next.name }, setReadOnly(value) { input.disabled = value; button.disabled = value }, destroy() {} }
        },
        destroy() {},
      }
    },
  }
  const editor = make([{ id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha {{w_badge}}' }, inline: { w_badge: { type: 'badge', dataVersion: 1, data: { name: 'Open' } } } }], { inlinePlugins: [definition], injectStyles: true })
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('[data-inline-plugin="badge"] button'))
  const after = editor.save().blocks
  equal(after[0].inline.w_badge.data, { name: 'Open!' })
  const widget = blockElement(editor, 'a').querySelector('[data-inline-plugin="badge"]'), input = widget.querySelector('input'), events = []
  editor.on('transaction:committed', event => events.push(event))
  await clickNative(input); await dispatchKey('a', 'KeyA', 65, 2); await printable('X'); equal(input.value, 'X')
  await dispatchKey('z', 'KeyZ', 90, 2); equal(input.value, 'Draft')
  equal(editor.save().blocks, after); equal(events.length, 0)
  widget.focus()
  await dispatchKey('z', 'KeyZ', 90, 2); equal(editor.save().blocks, before); equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10); equal(editor.save().blocks, after)
})

await run()
