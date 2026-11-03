import { createEditor } from '../../core/index.js'
import { test, assert, equal, run, make, editorHolder } from './regressions/harness.js'

function rejected(operation, expected) {
  let thrown = false
  try { operation() } catch (error) {
    thrown = true
    if (expected) assert(expected(error), `Unexpected failure: ${String(error)}`)
  }
  assert(thrown, 'Expected rejection before the effect')
}

function fixture({ blockUpdate = true } = {}) {
  const flags = { onDecode: null, onValue: null, onCreate: null, decodes: 0, reads: 0, failUpdate: false, failCreate: false }
  const blocks = [], widgets = []
  const blockSchema = {
    currentVersion: 1, createDefault: () => ({ text: '', count: 0 }),
    decode: input => ({ dataVersion: 1, data: { text: input.data.text, count: input.data.count } }),
    encode: data => ({ dataVersion: 1, data: { text: data.text, count: data.count } }),
    mapRichText: (data, visit) => ({ ...data, text: visit(data.text, 'text') }),
  }
  const block = { type: 'scope-block', icon: '', label: { key: 'block', fallback: 'Scope block' }, schema: blockSchema,
    setup() { return {
      create(initial, context) {
        if (flags.failCreate) throw new Error('block recovery failed')
        let data = initial
        const element = document.createElement('article')
        const text = document.createElement('p')
        text.textContent = data.text
        element.append(text)
        const owner = { context, element, destroyed: 0 }
        blocks.push(owner)
        return { element,
          read: () => data,
          ...(blockUpdate ? { update(next) {
            if (flags.failUpdate) throw new Error('block projection failed')
            data = next; text.textContent = next.text
          } } : {}),
          editableFields: () => [{ key: 'text', mode: 'rich-text', element: text }],
          setReadOnly(value) { text.contentEditable = String(!value) },
          destroy() { owner.destroyed++ },
        }
      }, destroy() {},
    } },
  }
  const inline = { type: 'scope-inline', icon: '', label: { key: 'inline', fallback: 'Scope inline' },
    schema: {
      currentVersion: 1, createDefault: () => ({ label: 'Default' }),
      decode(input) {
        flags.decodes++; flags.onDecode?.()
        return { dataVersion: 1, data: { get label() {
          flags.reads++; const replacement = flags.onValue?.(); return replacement === undefined ? input.data.label : replacement
        } } }
      },
      encode: data => ({ dataVersion: 1, data: { label: data.label } }),
    },
    setup() { return {
      create(id, initial, context) {
        const element = document.createElement('span')
        element.contentEditable = 'false'
        element.textContent = initial.label
        const owner = { context, element, destroyed: 0 }
        widgets.push(owner); flags.onCreate?.(context, initial, element)
        return { element, update(next) { element.textContent = next.label }, setReadOnly() {},
          destroy() { owner.destroyed++ },
        }
      }, destroy() {},
    } },
  }
  const editor = make([{ id: 'a', type: 'scope-block', dataVersion: 1,
    data: { text: 'Before{{ref}}After', count: 0 },
    inline: { ref: { type: 'scope-inline', dataVersion: 1, data: { label: 'Accepted' } } },
  }], { defaultBlock: 'scope-block', plugins: [block], inlinePlugins: [inline] })
  flags.decodes = flags.reads = 0
  return { editor, block, inline, flags, blocks, widgets,
    context: blocks[0].context, inlineContext: widgets[0].context }
}

test('a task captures its declared option once before authoring and preserves one undo gesture', () => {
  const h = fixture(), task = h.context.beginTask()
  const before = h.editor.save().blocks
  let reads = 0, denied = 0, producers = 0
  const forbidden = () => { denied++; return {} }
  equal(task.commit(current => { producers++; return { ...current, count: 1 } }, {
    get mergeWithPreviousField() {
      reads++
      rejected(() => h.editor.blocks.update('a', forbidden))
      rejected(() => h.editor.setReadOnly(true))
      rejected(() => h.editor.destroy())
      rejected(() => h.editor.blocks.focus('a'))
      rejected(() => h.context.beginTask())
      equal(task.commit(forbidden, { get mergeWithPreviousField() { throw new Error('recursive input') } }), false)
      equal(h.context.getData().count, 0)
      return 'count'
    },
    get unused() { throw new Error('unused option') },
  }), true)
  equal([reads, denied, producers], [1, 0, 1])
  equal(h.editor.save().blocks[0].data.count, 1)
  equal(h.editor.undo(), true)
  equal(h.editor.save().blocks, before)
  equal(h.editor.canUndo, false)
  equal(h.editor.redo(), true)
  equal(h.editor.save().blocks[0].data.count, 1)
})

test('a valid canonical no-op completes its task without history or publication', () => {
  const h = fixture(), task = h.context.beginTask()
  const before = h.editor.save().blocks, events = []
  h.editor.on('transaction:committed', event => events.push(event))
  equal(task.commit(current => current, null), true)
  equal(task.commit(() => { throw new Error('consumed producer') }, {
    get mergeWithPreviousField() { throw new Error('consumed option') },
  }), false)
  equal(h.editor.save().blocks, before)
  equal(h.editor.canUndo, false)
  equal(events, [])
  assert(!task.signal.aborted)
})

test('failed option capture retries, but cancellation during capture never invokes the producer', () => {
  const h = fixture(), task = h.context.beginTask()
  let producers = 0
  const producer = current => { producers++; return current }
  const failure = new Error('option failure')
  rejected(() => task.commit(producer, { get mergeWithPreviousField() { throw failure } }), error => error === failure)
  assert(!task.signal.aborted)
  equal(task.commit(producer), true)
  equal(producers, 1)
  const cancelled = h.context.beginTask()
  equal(cancelled.commit(producer, { get mergeWithPreviousField() { cancelled.cancel(); return 'count' } }), false)
  equal(producers, 1)
  assert(cancelled.signal.aborted)
  equal(h.editor.canUndo, false)
})

test('inline options cannot reenter authoring and remain one reversible action', () => {
  const h = fixture(), before = h.editor.save().blocks
  let reads = 0, denied = 0, producers = 0
  equal(h.inlineContext.updateData(current => { producers++; return { label: current.label + '!' } }, {
    get trailingText() {
      reads++
      rejected(() => h.editor.blocks.update('a', () => { denied++; return {} }))
      rejected(() => h.editor.destroy())
      rejected(() => h.inlineContext.beginTask())
      return ''
    },
    get unused() { throw new Error('unused inline option') },
  }), undefined)
  equal([reads, denied, producers], [1, 0, 1])
  equal(h.editor.save().blocks[0].inline.ref.data.label, 'Accepted!')
  equal(h.widgets.filter(owner => owner.element.isConnected).map(owner => owner.element.textContent), ['Accepted!'])
  equal(h.editor.undo(), true)
  equal(h.editor.save().blocks, before)
  equal(h.widgets.filter(owner => owner.element.isConnected).map(owner => owner.element.textContent), ['Accepted'])
  equal(h.editor.canUndo, false)
})

for (const boundary of ['onDecode', 'onValue']) {
  test(`inline ${boundary} returns data but cannot write or destroy its owning editor`, () => {
    const h = fixture(), before = h.editor.save().blocks
    let producers = 0
    h.flags[boundary] = () => {
      rejected(() => h.editor.blocks.update('a', () => { producers++; return {} }))
      rejected(() => h.editor.destroy())
      rejected(() => h.editor.setReadOnly(true))
      rejected(() => h.inlineContext.beginTask())
      rejected(() => h.context.updateData(() => { producers++; return {} }))
    }
    const result = h.inlineContext.getData()
    equal(result, { label: 'Accepted' })
    assert(Object.isFrozen(result))
    equal([h.flags.decodes, h.flags.reads, producers], [1, 1, 0])
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
    h.flags[boundary] = null
    h.editor.setReadOnly(true)
    equal(h.inlineContext.getData(), { label: 'Accepted' })
  })
}

test('retired inline input stays inert after Undo creates a same-ID successor', () => {
  const h = fixture(), old = h.inlineContext
  h.editor.blocks.remove('a')
  assert(old.signal.aborted)
  equal(h.editor.undo(), true)
  let reads = 0, producers = 0
  old.updateData(() => { producers++; return {} }, { get trailingText() { reads++; throw new Error('retired input') } })
  equal([reads, producers], [0, 0])
  const current = h.widgets.filter(owner => owner.element.isConnected)[0]
  current.context.updateData(() => ({ label: 'New occurrence' }))
  equal(h.editor.save().blocks[0].inline.ref.data.label, 'New occurrence')
})

test('a successful remount may abort its old task signal without changing its true result', () => {
  const h = fixture({ blockUpdate: false }), task = h.context.beginTask()
  const before = h.editor.save().blocks
  equal(task.commit(current => ({ ...current, count: 1 })), true)
  assert(task.signal.aborted, 'the old instance remained authoritative')
  assert(h.context.signal.aborted)
  equal(h.editor.save().blocks[0].data.count, 1)
  equal(task.commit(() => { throw new Error('retired producer') }), false)
  equal(h.editor.undo(), true)
  equal(h.editor.save().blocks, before)
  equal(h.editor.canUndo, false)
})

for (const kind of ['block', 'inline']) {
  test(`${kind} result cancellation leaves its document untouched and other tasks and editors live`, () => {
    const h = fixture(), independent = make()
    const context = kind === 'block' ? h.context : h.inlineContext
    const field = kind === 'block' ? 'count' : 'label'
    const task = context.beginTask(), sibling = context.beginTask()
    const before = h.editor.save().blocks, events = []
    h.editor.on('transaction:committed', event => events.push(event.action))
    let reads = 0, producers = 0
    rejected(() => task.commit(current => {
      producers++
      return { ...current, get [field]() {
        reads++
        task.cancel()
        independent.blocks.update('a', () => ({ data: { text: 'Independent result capture' } }))
        return kind === 'block' ? 1 : 'Cancelled result'
      } }
    }), error => error.name === 'AbortError')
    equal([reads, producers], [1, 1])
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
    equal(events, [])
    assert(task.signal.aborted)
    equal(task.commit(() => { throw new Error('Cancelled producer retried') }), false)
    assert(!sibling.signal.aborted && !context.signal.aborted)
    equal(independent.blocks.get('a').data.text, 'Independent result capture')
    equal(independent.undo(), true)
    equal(independent.blocks.get('a').data.text, 'A')

    equal(sibling.commit(current => ({ ...current, [field]: kind === 'block' ? 2 : 'Sibling result' })), true)
    const accepted = h.editor.save().blocks
    equal(kind === 'block' ? accepted[0].data.count : accepted[0].inline.ref.data.label,
      kind === 'block' ? 2 : 'Sibling result')
    equal(h.editor.undo(), true)
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
    equal(h.editor.redo(), true)
    equal(h.editor.save().blocks, accepted)
    equal(events, ['commit', 'undo', 'redo'])
  })
}

test('a healthy returned getter preserves scoped and host author composition in one history entry', () => {
  const h = fixture(), task = h.context.beginTask(), before = h.editor.save().blocks
  let reads = 0, nestedProducers = 0
  equal(task.commit(current => {
    h.editor.blocks.update('a', () => {
      nestedProducers++
      return { tunes: { textAlign: 'center' } }
    })
    return { ...current, get count() { reads++; return 3 } }
  }), true)
  equal([reads, nestedProducers], [1, 1])
  const accepted = h.editor.save().blocks
  equal(accepted[0].data, { text: 'Before{{ref}}After', count: 3 })
  equal(accepted[0].tunes, { textAlign: 'center' })
  equal(h.editor.undo(), true)
  equal(h.editor.save().blocks, before)
  equal(h.editor.canUndo, false)
  equal(h.editor.redo(), true)
  equal(h.editor.save().blocks, accepted)
})

test('public destruction after terminal transaction failure releases the holder exactly once', () => {
  const h = fixture(), holder = editorHolder(h.editor)
  const task = h.context.beginTask(), before = h.editor.save().blocks
  h.flags.failUpdate = h.flags.failCreate = true
  rejected(() => h.editor.blocks.update('a', current => ({ data: { ...current.data, count: 1 } })),
    error => error instanceof AggregateError)
  equal(h.editor.save().blocks, before)
  let producers = 0
  rejected(() => h.editor.blocks.update('a', () => { producers++; return {} }))
  equal(producers, 0)
  h.editor.destroy()
  h.editor.destroy()
  assert(task.signal.aborted && h.context.signal.aborted)
  assert(!holder.querySelector('.oe-editor'))
  h.blocks.forEach(owner => equal(owner.destroyed, 1))
  h.flags.failUpdate = h.flags.failCreate = false
  const replacement = createEditor({ holder, plugins: [h.block], injectStyles: false })
  try {
    h.editor.destroy()
    assert(holder.querySelector('.oe-editor'), 'old disposal destroyed the successor')
  } finally { replacement.destroy() }
})

for (const retirement of ['cancelled', 'consumed', 'mode-revoked']) {
  test(`retired task ${retirement} reads no options or producer and leaves its owner usable`, () => {
    const h = fixture(), task = h.context.beginTask(), before = h.editor.save().blocks
    if (retirement === 'cancelled') task.cancel()
    else if (retirement === 'consumed') equal(task.commit(current => current), true)
    else { h.editor.setReadOnly(true); h.editor.setReadOnly(false) }
    let reads = 0, producers = 0
    equal(task.commit(() => { producers++; return { count: 9 } }, {
      get mergeWithPreviousField() { reads++; throw new Error('retired option was read') },
    }), false)
    equal([reads, producers], [0, 0])
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
    equal(task.signal.aborted, retirement !== 'consumed')
    equal(h.context.beginTask().commit(current => ({ ...current, count: 1 })), true)
    equal(h.editor.save().blocks[0].data.count, 1)
    equal(h.editor.undo(), true)
    equal(h.editor.save().blocks, before)
  })
}

for (const payload of [undefined, null, false, 0, '', NaN]) {
  test(`option capture throw ${String(payload)} preserves exact failure and a retryable task`, () => {
    const h = fixture(), task = h.context.beginTask(), before = h.editor.save().blocks
    let producers = 0, reads = 0, caught, threw = false
    try { task.commit(current => { producers++; return current }, {
      get mergeWithPreviousField() { reads++; throw payload },
    }) } catch (error) { caught = error; threw = true }
    equal([threw, Object.is(caught, payload), reads, producers, task.signal.aborted], [true, true, 1, 0, false])
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
    equal(task.commit(current => { producers++; return { ...current, count: 1 } }), true)
    equal(producers, 1)
    equal(h.editor.save().blocks[0].data.count, 1)
    equal(h.editor.undo(), true)
    equal(h.editor.save().blocks, before)
  })
  test(`entered producer throw ${String(payload)} consumes only its task and preserves exact failure`, () => {
    const h = fixture(), task = h.context.beginTask(), before = h.editor.save().blocks, events = []
    h.editor.on('transaction:committed', event => events.push(event.action))
    let reads = 0, producers = 0, caught, threw = false
    try { task.commit(() => { producers++; throw payload }) } catch (error) { caught = error; threw = true }
    equal([threw, Object.is(caught, payload), producers, task.signal.aborted], [true, true, 1, true])
    equal(task.commit(() => { producers++; return {} }, {
      get mergeWithPreviousField() { reads++; throw new Error('consumed option was read') },
    }), false)
    equal([reads, producers], [0, 1])
    equal(h.editor.save().blocks, before)
    equal(h.editor.canUndo, false)
    equal(events, [])
    equal(h.context.beginTask().commit(current => ({ ...current, count: 1 })), true)
    equal(h.editor.save().blocks[0].data.count, 1)
    equal(events, ['commit'])
  })
}

test('task option capture preserves foreign native focus and selection, with a later live focus control', () => {
  const h = fixture(), button = document.createElement('button')
  button.textContent = 'Foreign focus control'; document.body.append(button); button.focus()
  const native = window.getSelection()
  native.setBaseAndExtent(button.firstChild, 3, button.firstChild, 3)
  const node = native.anchorNode, offset = native.anchorOffset
  try {
    equal([document.activeElement === button, native.anchorNode === button.firstChild, native.anchorOffset], [true, true, 3])
    equal(h.context.beginTask().commit(current => ({ ...current, count: 1 }), {
      get mergeWithPreviousField() {
        rejected(() => h.editor.blocks.focus('a'))
        equal(document.activeElement === button, true)
        equal([native.anchorNode === node, native.anchorOffset], [true, offset])
        return 'text'
      },
    }), true)
    equal(document.activeElement === button, true)
    equal(h.editor.blocks.focus('a'), true)
    equal(h.editor.save().blocks[0].data.count, 1)
  } finally { button.remove() }
})

for (const variant of ['remount', 'in-place', 'no-op']) {
  test(`accepted ${variant} task settles independently from a second pending task`, () => {
    const h = fixture({ blockUpdate: variant !== 'remount' }), before = h.editor.save().blocks
    const task = h.context.beginTask(), pending = h.context.beginTask()
    equal(task.commit(current => variant === 'no-op' ? current : { ...current, count: 1 }), true)
    equal([task.signal.aborted, h.context.signal.aborted], [variant === 'remount', variant === 'remount'])
    let reads = 0, producers = 0
    equal(pending.commit(current => { producers++; return { ...current, count: 2 } }, {
      get mergeWithPreviousField() { reads++; return 'count' },
    }), variant !== 'remount')
    equal([reads, producers], variant === 'remount' ? [0, 0] : [1, 1])
    equal(h.editor.save().blocks[0].data.count, variant === 'remount' ? 1 : 2)
    const live = h.blocks.at(-1).context
    equal(live.beginTask().commit(current => ({ ...current, count: 3 })), true)
    equal(h.editor.save().blocks[0].data.count, 3)
    equal(h.editor.undo(), true)
    equal(h.editor.save().blocks[0].data.count, variant === 'remount' ? 1 : 2)
    while (h.editor.canUndo) h.editor.undo()
    equal(h.editor.save().blocks, before)
  })
}

test('the exact revoked inline reader aborts before decode while its same-ID successor remains readable', () => {
  const h = fixture(), old = h.inlineContext
  h.editor.blocks.remove('a'); equal(h.editor.undo(), true)
  h.flags.decodes = h.flags.reads = 0
  let error
  try { old.getData() } catch (failure) { error = failure }
  equal([error?.name, h.flags.decodes, h.flags.reads, old.signal.aborted], ['AbortError', 0, 0, true])
  const current = h.widgets.filter(owner => owner.element.isConnected)[0]
  equal(current.context.getData(), { label: 'Accepted' })
  equal([h.flags.decodes, h.flags.reads, current.context.signal.aborted], [1, 1, false])
})

test('decoded reads survive normal, read-only and staged construction without blocking later host commands', () => {
  const h = fixture(), before = h.editor.save().blocks
  const read = context => {
    h.flags.decodes = h.flags.reads = 0
    h.flags.onValue = () => 'Decoded read'
    try { return context.getData() } finally { h.flags.onValue = null }
  }
  const normal = read(h.inlineContext)
  equal(normal, { label: 'Decoded read' }); equal([h.flags.decodes, h.flags.reads], [1, 1]); assert(Object.isFrozen(normal))
  h.editor.setReadOnly(true)
  const readonly = read(h.inlineContext)
  equal(readonly, { label: 'Decoded read' }); equal([h.flags.decodes, h.flags.reads], [1, 1]); assert(Object.isFrozen(readonly))
  h.editor.setReadOnly(false)
  equal(h.editor.save().blocks, before)
  equal(h.editor.canUndo, false)
  h.editor.blocks.remove('a')
  const staged = []
  h.flags.onCreate = (context, initial, element) => {
    const decoded = read(context)
    staged.push({ decoded, frozen: Object.isFrozen(decoded), connected: element.isConnected,
      live: !context.signal.aborted, initial: initial.label, decodes: h.flags.decodes, reads: h.flags.reads })
  }
  equal(h.editor.undo(), true)
  h.flags.onCreate = null
  equal(staged, [{ decoded: { label: 'Decoded read' }, frozen: true, connected: false, live: true, initial: 'Accepted', decodes: 1, reads: 1 }])
  h.editor.blocks.update('a', block => ({ data: { ...block.data, count: 1 } }))
  equal(h.editor.save().blocks[0].data.count, 1)
  equal(h.editor.undo(), true)
  equal(h.editor.save().blocks, before)
})

test('a canonical task no-op preserves an existing redo branch and cannot be recommitted', () => {
  const h = fixture(), before = h.editor.save().blocks, events = []
  h.editor.on('transaction:committed', event => events.push(event.action))
  equal(h.context.beginTask().commit(data => ({ ...data, count: 1 })), true)
  equal(h.editor.undo(), true)
  equal(h.editor.canRedo, true)
  const live = h.blocks.filter(owner => owner.element.isConnected).at(-1).context
  const task = live.beginTask()
  equal(task.commit(data => data), true)
  assert(!task.signal.aborted)
  let reads = 0, producers = 0
  equal(task.commit(() => { producers++; return {} }, {
    get mergeWithPreviousField() { reads++; throw new Error('consumed no-op input') },
  }), false)
  equal([reads, producers], [0, 0])
  equal([h.editor.canUndo, h.editor.canRedo], [false, true])
  equal(h.editor.save().blocks, before)
  equal(events, ['commit', 'undo'])
  equal(h.editor.redo(), true)
  equal(h.editor.save().blocks[0].data.count, 1)
  equal(h.editor.undo(), true)
  equal(h.editor.save().blocks, before)
  equal(events, ['commit', 'undo', 'redo', 'undo'])
})

await run()
