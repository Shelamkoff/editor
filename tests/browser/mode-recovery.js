import { createEditor } from '../../core/index.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { test, assert, equal, run, make, para, editorHolder } from './regressions/harness.js'

function thrown(operation) {
  try { operation() } catch (error) { return error }
  throw new Error('Expected operation to throw')
}

function fixture({ readOnly = false } = {}) {
  const flags = { armed: false, rollbacks: new Map(), forward: new Error('inline forward failure'), restore: [] }
  const widgets = [], calls = []
  let createCount = 0
  const schema = {
    currentVersion: 1,
    createDefault: () => ({ label: 'widget' }),
    decode: input => ({ dataVersion: 1, data: { label: input.data.label } }),
    encode: data => ({ dataVersion: 1, data: { label: data.label } }),
  }
  const inline = {
    type: 'mode-probe', icon: '', label: { key: 'mode', fallback: 'Mode' }, schema,
    setup() { return {
      create(id, data, context) {
        if (createCount >= 2 && flags.restore.length) throw flags.restore[0]
        const original = createCount++ < 2
        const element = document.createElement('button')
        element.type = 'button'
        element.textContent = data.label
        const widget = { id, context, element, destroyed: 0 }
        let attempted = false
        widgets.push(widget)
        return { element,
          update(next) { element.textContent = next.label },
          setReadOnly(value) {
            if (flags.armed && original && value !== readOnly) attempted = true
            if (flags.armed && original && attempted) {
              calls.push([id, value])
              if (value === readOnly && flags.rollbacks.has(id)) throw flags.rollbacks.get(id)
            }
            element.disabled = value
            if (flags.armed && original && value !== readOnly && id === 'second') throw flags.forward
          },
          destroy() { widget.destroyed++ },
        }
      },
      destroy() {},
    } },
  }
  const record = para('a', 'A{{first}}B{{second}}C', {
    inline: Object.fromEntries(['first', 'second'].map(id => [id, {
      type: 'mode-probe', dataVersion: 1, data: { label: id },
    }])),
  })
  const editor = make([record], { inlinePlugins: [inline], readOnly })
  const live = () => widgets.filter(widget => widget.element.isConnected)
  return { flags, widgets, calls, editor, live }
}

const payloads = [undefined, null, false, 0, '', NaN, new Error('inline rollback error')]
for (const readOnly of [false, true]) {
  for (const payload of payloads) {
    test(`inline mode ${readOnly}: rollback throw ${String(payload)} restores committed controls`, () => {
      const h = fixture({ readOnly })
      const before = h.editor.save().blocks
      const originals = [...h.widgets]
      const events = []
      h.editor.on('transaction:committed', event => events.push(event))
      const task = readOnly ? null : originals[0].context.beginTask()
      h.flags.rollbacks.set('first', payload)
      h.flags.armed = true
      assert(thrown(() => h.editor.setReadOnly(!readOnly)) === h.flags.forward, 'forward error identity changed')
      equal(h.editor.readOnly, readOnly)
      equal(h.live().map(widget => widget.element.disabled), [readOnly, readOnly])
      equal(h.editor.save().blocks, before)
      equal(events, [])
      equal(h.editor.canUndo, false)
      for (const widget of originals) {
        assert(widget.context.signal.aborted, 'retired inline context kept its signal')
        equal(widget.destroyed, 1)
      }
      if (task) {
        assert(task.signal.aborted, 'remount left its old task live')
        let producers = 0
        equal(task.commit(() => { producers++; return { label: 'stale' } }), false)
        equal(producers, 0)
      }
      h.flags.armed = false
      h.editor.setReadOnly(!readOnly)
      equal(h.live().map(widget => widget.element.disabled), [!readOnly, !readOnly])
      h.editor.setReadOnly(readOnly)
      equal(h.live().map(widget => widget.element.disabled), [readOnly, readOnly])
    })
  }
}

for (const payload of payloads) {
  test(`inline forward throw ${String(payload)} with successful reversal does not replace instances`, () => {
    const h = fixture()
    const originals = [...h.widgets]
    h.flags.forward = payload
    h.flags.armed = true
    assert(Object.is(thrown(() => h.editor.setReadOnly(true)), payload), 'forward throw was replaced')
    equal(h.editor.readOnly, false)
    equal(h.live().map(widget => widget.element.disabled), [false, false])
    equal(h.calls, [['first', true], ['second', true], ['second', false], ['first', false]])
    equal(h.widgets.length, 2)
    originals.forEach(widget => {
      assert(widget.element.isConnected && !widget.context.signal.aborted)
      equal(widget.destroyed, 0)
    })
  })
}

for (const payload of payloads) {
  test(`inline secondary restore throw ${String(payload)} preserves accepted model and permits public disposal`, () => {
    const h = fixture()
    const before = h.editor.save().blocks
    h.flags.forward = undefined
    h.flags.rollbacks.set('first', null)
    h.flags.rollbacks.set('second', false)
    h.flags.restore.push(payload)
    h.flags.armed = true
    const failure = thrown(() => h.editor.setReadOnly(true))
    assert(failure instanceof AggregateError, 'secondary failure was not classified')
    equal(failure.errors, [undefined, false, null, payload])
    equal(failure.errors.map((error, index) => Object.is(error, [undefined, false, null, payload][index])), [true, true, true, true])
    equal(h.editor.readOnly, false)
    equal(h.editor.save().blocks, before)
    let producers = 0
    thrown(() => h.editor.blocks.update('a', () => { producers++; return {} }))
    equal(producers, 0)
    h.editor.destroy()
    h.editor.destroy()
    h.widgets.forEach(widget => {
      assert(widget.context.signal.aborted)
      equal(widget.destroyed, 1)
    })
    assert(!editorHolder(h.editor).querySelector('.oe-editor'), 'failed editor retained its root')
    releasedHolderControl(h.editor)
  })
}

function releasedHolderControl(editor) {
  const holder = editorHolder(editor)
  const replacement = createEditor({ holder, plugins: [createParagraphPlugin()], injectStyles: false,
    data: { version: '2.0.0', blocks: [para('live', 'Replacement')] } })
  try {
    editor.destroy()
    equal(replacement.save().blocks, [para('live', 'Replacement')])
    assert(holder.querySelector('.oe-editor'), 'old disposal removed the replacement')
  } finally { replacement.destroy() }
  assert(!holder.querySelector('.oe-editor'), 'replacement disposal retained its root')
}

function blockFixture({ readOnly = false } = {}) {
  const flags = { armed: false, rollbacks: new Map(), forward: new Error('block forward failure'), restore: [] }
  const controls = [], calls = []
  const block = { type: 'mode-block', icon: '', label: { key: 'mode-block', fallback: 'Mode block' },
    schema: { currentVersion: 1, createDefault: () => ({ text: '' }),
      decode: input => ({ dataVersion: 1, data: { text: input.data.text } }),
      encode: data => ({ dataVersion: 1, data: { text: data.text } }) },
    setup() { return {
      create(initial, context) {
        if (controls.length >= 2 && flags.restore.length) throw flags.restore[0]
        const original = controls.length < 2
        const element = document.createElement('button')
        element.type = 'button'; element.textContent = initial.text
        const owner = { context, element, id: initial.text, destroyed: 0 }
        controls.push(owner)
        let data = initial
        return { element, read: () => data,
          update(next) { data = next; element.textContent = next.text },
          setReadOnly(value) {
            if (flags.armed && original) {
              calls.push([owner.id, value])
              if (value === readOnly && flags.rollbacks.has(owner.id)) throw flags.rollbacks.get(owner.id)
            }
            element.disabled = value
            if (flags.armed && original && value !== readOnly && owner.id === 'b') throw flags.forward
          },
          destroy() { owner.destroyed++ },
        }
      }, destroy() {},
    } },
  }
  const editor = make(['a', 'b'].map(id => ({ id, type: 'mode-block', dataVersion: 1, data: { text: id } })),
    { readOnly, defaultBlock: 'mode-block', plugins: [block] })
  return { flags, controls, calls, editor, live: () => controls.filter(owner => owner.element.isConnected) }
}

for (const readOnly of [false, true]) {
  for (const payload of payloads) {
    test(`block mode ${readOnly}: rollback throw ${String(payload)} restores committed controls`, () => {
      const h = blockFixture({ readOnly }), before = h.editor.save().blocks, originals = [...h.controls], events = []
      h.editor.on('transaction:committed', event => events.push(event.action))
      const task = readOnly ? null : originals[0].context.beginTask()
      h.flags.rollbacks.set('a', payload); h.flags.armed = true
      assert(thrown(() => h.editor.setReadOnly(!readOnly)) === h.flags.forward)
      equal(h.editor.readOnly, readOnly)
      equal(h.live().map(owner => owner.element.disabled), [readOnly, readOnly])
      equal(h.calls, [['a', !readOnly], ['b', !readOnly], ['b', readOnly], ['a', readOnly]])
      equal(h.editor.save().blocks, before); equal(events, []); equal(h.editor.canUndo, false)
      for (const owner of originals) { assert(owner.context.signal.aborted); equal(owner.destroyed, 1) }
      if (task) {
        assert(task.signal.aborted)
        let producers = 0, options = 0
        equal(task.commit(() => { producers++; return {} }, {
          get mergeWithPreviousField() { options++; return 'text' },
        }), false)
        equal([options, producers], [0, 0])
      }
      h.flags.armed = false
      h.editor.setReadOnly(!readOnly)
      equal(h.live().map(owner => owner.element.disabled), [!readOnly, !readOnly])
      h.editor.setReadOnly(readOnly)
      equal(h.live().map(owner => owner.element.disabled), [readOnly, readOnly])
    })
  }
}

for (const payload of payloads) {
  test(`block forward throw ${String(payload)} with successful reversal does not replace instances`, () => {
    const h = blockFixture(), originals = [...h.controls], before = h.editor.save().blocks
    h.flags.forward = payload; h.flags.armed = true
    assert(Object.is(thrown(() => h.editor.setReadOnly(true)), payload))
    equal(h.editor.readOnly, false)
    equal(h.live().map(owner => owner.element.disabled), [false, false])
    equal(h.calls, [['a', true], ['b', true], ['b', false], ['a', false]])
    equal(h.controls.length, 2)
    originals.forEach(owner => { assert(owner.element.isConnected && !owner.context.signal.aborted); equal(owner.destroyed, 0) })
    equal(h.editor.save().blocks, before); equal(h.editor.canUndo, false)
  })
}

for (const payload of payloads) {
  test(`block secondary restore throw ${String(payload)} preserves accepted model and permits public disposal`, () => {
    const h = blockFixture(), before = h.editor.save().blocks
    h.flags.forward = undefined
    h.flags.rollbacks.set('a', null); h.flags.rollbacks.set('b', false)
    h.flags.restore.push(payload); h.flags.armed = true
    const failure = thrown(() => h.editor.setReadOnly(true))
    assert(failure instanceof AggregateError)
    equal(failure.errors, [undefined, false, null, payload])
    equal(failure.errors.map((error, index) => Object.is(error, [undefined, false, null, payload][index])), [true, true, true, true])
    equal(h.editor.readOnly, false); equal(h.editor.save().blocks, before)
    let producers = 0
    thrown(() => h.editor.blocks.update('a', () => { producers++; return {} }))
    equal(producers, 0)
    h.editor.destroy(); h.editor.destroy()
    h.controls.forEach(owner => { assert(owner.context.signal.aborted); equal(owner.destroyed, 1) })
    assert(!editorHolder(h.editor).querySelector('.oe-editor'))
    releasedHolderControl(h.editor)
  })
}

for (const kind of ['inline', 'block']) {
  test(`${kind} successful mode round trip preserves instances and history while retiring old tasks`, () => {
    const h = kind === 'inline' ? fixture() : blockFixture()
    const owners = kind === 'inline' ? h.widgets : h.controls
    const original = [...owners], before = h.editor.save().blocks, events = []
    h.editor.on('transaction:committed', event => events.push(event.action))
    const task = original[0].context.beginTask()
    h.editor.setReadOnly(true); h.editor.setReadOnly(true)
    equal(h.editor.readOnly, true); equal(h.live().map(owner => owner.element.disabled), [true, true])
    h.editor.setReadOnly(false)
    equal(h.editor.readOnly, false); equal(h.live().map(owner => owner.element.disabled), [false, false])
    equal(owners.length, 2)
    equal(h.live().map((owner, index) => owner === original[index]), [true, true])
    original.forEach(owner => { assert(!owner.context.signal.aborted); equal(owner.destroyed, 0) })
    assert(task.signal.aborted)
    let producers = 0, options = 0
    equal(task.commit(() => { producers++; return {} }, {
      get mergeWithPreviousField() { options++; return 'text' },
    }), false)
    equal([options, producers], [0, 0])
    equal(original[0].context.beginTask().commit(current => current), true)
    equal(h.editor.save().blocks, before); equal(h.editor.canUndo, false); equal(events, [])
  })
}

await run()
