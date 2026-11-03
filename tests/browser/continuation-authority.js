import { createEditor } from '../../core/index.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { test, assert, equal, run, make, para, editorHolder, pause } from './regressions/harness.js'

const BEFORE = 'https://before.example', AFTER = 'https://after.example', FINAL = 'https://final.example'
function fixture(options = {}) {
  const blocks = [], widgets = []
  const schema = { currentVersion: 1, createDefault: () => ({ url: BEFORE, title: '' }),
    decode: input => ({ dataVersion: 1, data: { url: input.data.url, title: input.data.title } }),
    encode: data => ({ dataVersion: 1, data: { url: data.url, title: data.title } }) }
  const label = data => data.url + '|' + data.title
  const block = { type: 'continuation-block', icon: '', label: { key: 'block', fallback: 'Continuation' },
    schema: { ...schema,
      createDefault: () => ({ text: '{{ref}}', url: BEFORE, title: '' }),
      decode: input => ({ dataVersion: 1, data: { text: input.data.text, url: input.data.url, title: input.data.title } }),
      encode: data => ({ dataVersion: 1, data: { text: data.text, url: data.url, title: data.title } }),
      mapRichText: (data, visit) => ({ ...data, text: visit(data.text, 'text') }) },
    setup() { return { create(initial, context) {
      let data = initial
      const element = document.createElement('article'), field = document.createElement('p'), output = document.createElement('output')
      field.innerHTML = data.text; output.textContent = label(data); element.append(field, output)
      blocks.push({ context, element, output })
      return { element, read: () => data,
        update(next) { if (next.text !== data.text) field.innerHTML = next.text; data = next; output.textContent = label(data) },
        editableFields: () => [{ key: 'text', element: field, mode: 'rich-text' }],
        setReadOnly(value) { field.contentEditable = String(!value) }, destroy() {} }
    }, destroy() {} } },
  }
  const inline = { type: 'continuation-inline', icon: '', label: { key: 'inline', fallback: 'Continuation inline' }, schema,
    setup() { return { create(id, initial, context) {
      const element = document.createElement('span'); element.contentEditable = 'false'; element.textContent = label(initial)
      widgets.push({ context, element })
      return { element, update(next) { element.textContent = label(next) }, setReadOnly() {}, destroy() {} }
    }, destroy() {} } },
  }
  const editor = make([{ id: 'a', type: block.type, dataVersion: 1, data: { text: '{{ref}}', url: BEFORE, title: '' },
    inline: { ref: { type: inline.type, dataVersion: 1, data: { url: BEFORE, title: '' } } } }, para('b', 'Bravo')],
  { plugins: [block, createParagraphPlugin()], inlinePlugins: [inline], defaultBlock: block.type, ...options })
  return { editor, blocks, widgets, context: blocks[0].context, inlineContext: widgets[0].context,
    latest: kind => (kind === 'block' ? blocks : widgets).findLast(owner => owner.element.isConnected) }
}

function values(editor, kind) {
  const a = editor.save().blocks[0]
  const data = kind === 'block' ? a.data : a.inline.ref.data
  return [data.url, data.title]
}

for (const kind of ['block', 'inline']) {
  for (const variant of ['eligible', 'host-predecessor', 'intervening-host', 'changed-hint-field', 'wrong-hint-field', 'eligible-after-query-noop']) {
    if (kind === 'inline' && variant === 'host-predecessor') {
      test('inline host patch rejection preserves its live task and independent history', () => {
        const h = fixture(), before = h.editor.save().blocks, task = h.inlineContext.beginTask()
        let failure
        try { h.editor.blocks.update('a', current => ({ inline: current.inline })) } catch (error) { failure = error }
        assert(failure instanceof TypeError)
        equal(h.editor.save().blocks, before); equal(h.editor.canUndo, false); assert(!task.signal.aborted)
        h.inlineContext.updateData(data => ({ ...data, url: AFTER }))
        equal(task.commit(data => ({ ...data, title: 'Metadata' }), { mergeWithPreviousField: 'url' }), true)
        equal(values(h.editor, 'inline'), [AFTER, 'Metadata'])
        equal(h.editor.undo(), true); equal(values(h.editor, 'inline'), [AFTER, '']); equal(h.editor.canUndo, true)
        equal(h.editor.undo(), true); equal(h.editor.save().blocks, before); equal(h.editor.canUndo, false)
      })
      continue
    }
    test(`${kind} completion history ${variant} preserves data and qualified grouping`, () => {
      const h = fixture(), before = h.editor.save().blocks, events = []
      h.editor.on('transaction:committed', event => events.push([event.action, event.origin, event.name]))
      const context = kind === 'block' ? h.context : h.inlineContext
      if (variant === 'host-predecessor') {
        h.editor.blocks.update('a', current => ({ data: { ...current.data, url: AFTER } }))
      } else context.updateData(current => ({ ...current, url: AFTER }))
      const prior = h.editor.save().blocks
      const currentContext = h.latest(kind).context
      const task = currentContext.beginTask()
      if (variant === 'intervening-host') h.editor.blocks.update('b', current => ({ data: { ...current.data, text: 'Intervening' } }))
      if (variant === 'eligible-after-query-noop') {
        equal([currentContext.getData().url, currentContext.getData().title], [AFTER, ''])
        currentContext.updateData(current => current)
      }
      const predecessor = h.editor.save().blocks
      equal(task.commit(current => ({ ...current, title: 'Metadata', url: variant === 'changed-hint-field' ? FINAL : current.url }),
        { mergeWithPreviousField: variant === 'wrong-hint-field' ? 'title' : 'url' }), true)
      const accepted = h.editor.save().blocks, url = variant === 'changed-hint-field' ? FINAL : AFTER
      equal(values(h.editor, kind), [url, 'Metadata'])
      equal(h.latest(kind)[kind === 'block' ? 'output' : 'element'].textContent, url + '|Metadata')
      const origin = variant === 'host-predecessor' ? 'external' : 'plugin'
      const name = kind === 'block' || variant === 'host-predecessor' ? 'block.update' : 'inline-widget.update'
      equal(events.filter(event => event[0] === 'commit'), variant === 'intervening-host'
        ? [['commit', 'plugin', name], ['commit', 'external', 'block.update'], ['commit', 'plugin', name]]
        : [['commit', origin, name], ['commit', 'plugin', kind === 'block' ? 'block.update' : 'inline-widget.update']])
      equal(h.editor.undo(), true)
      const merged = kind === 'block' && (variant === 'eligible' || variant === 'eligible-after-query-noop')
      equal(h.editor.save().blocks, merged ? before : predecessor)
      equal(h.editor.canUndo, !merged)
      if (!merged) {
        if (variant === 'intervening-host') { equal(h.editor.undo(), true); equal(h.editor.save().blocks, prior) }
        equal(h.editor.undo(), true); equal(h.editor.save().blocks, before); equal(h.editor.canUndo, false)
      }
      while (h.editor.canRedo) h.editor.redo()
      equal(h.editor.save().blocks, accepted)
      equal(h.editor.canRedo, false)
    })
  }
}

for (const lifetime of ['live', 'mode-retired', 'destroyed']) {
  test(`publication continuation ${lifetime} admits only later live host commands`, async () => {
    const h = fixture(), task = h.context.beginTask(), events = []
    let release, observed, nested = 0, later = 0, denied = 0, handled = false, oldOptions = 0, oldProducers = 0
    const barrier = new Promise(resolve => { release = resolve })
    h.editor.on('transaction:committed', event => {
      events.push(event.action)
      if (handled) return
      handled = true
      observed = (async () => {
        try { h.editor.blocks.update('b', () => { nested++; return { data: { text: 'Forbidden' } } }) } catch { denied++ }
        await barrier
        try { h.editor.blocks.update('b', () => { later++; return { data: { text: 'From observer' } } }) } catch { denied++ }
        if (lifetime !== 'live') equal(task.commit(() => { oldProducers++; return {} }, {
          get mergeWithPreviousField() { oldOptions++; return 'url' },
        }), false)
      })()
      return observed
    })
    h.editor.blocks.update('a', current => ({ data: { ...current.data, title: 'Trigger' } }))
    equal([nested, later, denied], [0, 0, 1])
    equal(events, ['commit'])
    if (lifetime === 'mode-retired') { h.editor.setReadOnly(true); h.editor.setReadOnly(false) }
    else if (lifetime === 'destroyed') h.editor.destroy()
    release(); await observed
    equal([nested, later, denied], [0, lifetime === 'destroyed' ? 0 : 1, lifetime === 'destroyed' ? 2 : 1])
    equal([oldOptions, oldProducers], [0, 0])
    equal(task.signal.aborted, lifetime !== 'live')
    equal(events, lifetime === 'destroyed' ? ['commit'] : ['commit', 'commit'])
    if (lifetime !== 'destroyed') {
      equal(h.editor.save().blocks.map(block => block.data.title ?? block.data.text), ['Trigger', 'From observer'])
      equal(h.editor.undo(), true)
      equal(h.editor.save().blocks.map(block => block.data.title ?? block.data.text), ['Trigger', 'Bravo'])
      equal(h.editor.undo(), true)
      equal(h.editor.save().blocks.map(block => block.data.title ?? block.data.text), ['', 'Bravo'])
    } else {
      const replacement = createEditor({ holder: editorHolder(h.editor), plugins: [createParagraphPlugin()], injectStyles: false,
        data: { version: '2.0.0', blocks: [para('live', 'Successor')] } })
      try { replacement.blocks.update('live', () => ({ data: { text: 'Independent successor' } })); equal(replacement.save().blocks[0].data.text, 'Independent successor') }
      finally { replacement.destroy() }
    }
  })
}

for (const lifetime of ['live', 'mode-retired', 'destroyed']) {
  test(`diagnostic continuation ${lifetime} guards metadata and admits only later live host commands`, async () => {
    const diagnostics = [], events = []
    let h, delivered = 0, later = 0, blocked = 0, metadata = 0, nested = 0, oldOptions = 0, oldProducers = 0
    const fault = new Error('private author content must not be reported')
    Object.defineProperty(fault, 'name', { get() {
      metadata++
      try { h.editor.blocks.update('b', () => { nested++; return { data: { text: 'Forbidden metadata' } } }) } catch { blocked++ }
      return 'DeferredProbeError'
    } })
    h = fixture({ onDiagnostic(diagnostic) {
      diagnostics.push({ code: diagnostic.code, operation: diagnostic.operation, errorName: diagnostic.errorName,
        keys: Object.keys(diagnostic).sort(), frozen: Object.isFrozen(diagnostic), finiteTimestamp: Number.isFinite(diagnostic.timestamp) })
      delivered++
      try { h.editor.blocks.update('b', () => { later++; return { data: { text: 'From diagnostic' } } }) } catch { blocked++ }
    } })
    const task = h.context.beginTask()
    h.editor.on('transaction:committed', event => events.push(event.action))
    let caught
    try { task.commit(() => { throw fault }) } catch (error) { caught = error }
    assert(caught === fault)
    equal([metadata, nested, delivered, later], [2, 0, 0, 0])
    equal(events, [])
    equal(task.signal.aborted, true)
    if (lifetime === 'mode-retired') { h.editor.setReadOnly(true); h.editor.setReadOnly(false) }
    else if (lifetime === 'destroyed') h.editor.destroy()
    await pause(0)
    equal([metadata, nested, delivered, later, blocked], [2, 0, 1, lifetime === 'destroyed' ? 0 : 1, lifetime === 'destroyed' ? 3 : 2])
    equal(task.commit(() => { oldProducers++; return {} }, { get mergeWithPreviousField() { oldOptions++; return 'url' } }), false)
    equal([oldOptions, oldProducers], [0, 0])
    equal(diagnostics, [{ code: 'command.failed', operation: 'block.update', errorName: 'DeferredProbeError',
      keys: ['code', 'errorName', 'operation', 'timestamp'], frozen: true, finiteTimestamp: true }])
    equal(events, lifetime === 'destroyed' ? [] : ['commit'])
    if (lifetime !== 'destroyed') {
      equal(h.editor.save().blocks[1].data.text, 'From diagnostic')
      equal(h.editor.undo(), true); equal(h.editor.save().blocks[1].data.text, 'Bravo'); equal(h.editor.canUndo, false)
    }
  })
}

for (const kind of ['publication', 'diagnostic']) {
  for (const failure of [new Error('late observer error'), false]) {
    test(`${kind} late rejection ${String(failure)} leaves the accepted action intact`, async () => {
      let calls = 0, release
      const barrier = new Promise(resolve => { release = resolve })
      const callback = async () => { if (calls++) return; await barrier; throw failure }
      const h = fixture(kind === 'diagnostic' ? { onDiagnostic: callback, diagnosticThresholds: { commandMs: 0 } } : {})
      if (kind === 'publication') h.editor.on('transaction:committed', callback)
      h.editor.blocks.update('a', current => ({ data: { ...current.data, title: 'Accepted' } }))
      const accepted = h.editor.save().blocks
      await Promise.resolve()
      release(); await pause(0)
      equal(calls, 1)
      equal(h.editor.save().blocks, accepted)
      equal(h.editor.canUndo, true)
      equal(h.editor.undo(), true)
      equal(h.editor.save().blocks[0].data.title, '')
    })
  }
}

await run()
