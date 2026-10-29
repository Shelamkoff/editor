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
        widgets.push(widget)
        return { element,
          update(next) { element.textContent = next.label },
          setReadOnly(value) {
            if (flags.armed && original) {
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
  })
}

await run()
