import { createPresentationNativeFixture } from './regressions/presentation-fixture.js'
import { test, equal, run, pause } from './regressions/harness.js'

const settle = () => pause(40)
const all = values => values.every(Boolean)
function inspect(h, original) {
  const a = h.panels.get('a'), b = h.panels.get('b')
  return {
    saved: h.editor.save().blocks,
    history: [h.editor.canUndo, h.editor.canRedo, h.state.transactions.length],
    mode: h.editor.readOnly,
    a: { editable: a.field().contentEditable, empty: a.field().innerHTML === '',
      known: !!h.latest('a-back')?.element.isConnected, opaque: !!a.field().querySelector('[data-oe-opaque-inline="a-opaque"]') },
    b: { editable: b.field().contentEditable, known: !!h.latest('b-back')?.element.isConnected,
      opaque: !!b.field().querySelector('[data-oe-opaque-inline="b-opaque"]') },
    siblings: original.map((entry, index) => ({ same: h.latest(['a-note', 'b-note'][index]) === entry.widget,
      connected: entry.widget.element.isConnected, live: !entry.widget.context.signal.aborted, task: !entry.task.signal.aborted })),
    diagnostics: h.state.diagnostics.filter(item => item.operation === 'projection.presentation').map(item => ({
      contentFree: !JSON.stringify(item).includes('controlled') && !JSON.stringify(item).includes('Note '), frozen: Object.isFrozen(item),
    })),
    capHit: h.state.capHit,
  }
}
function doc(partial = false) {
  return ['a', 'b'].map(name => ({ id: name, type: 'presentation-fixture', dataVersion: 1,
    data: { name, front: `Front {{${name}-front}}`, back: `Back {{${name}-back}}${partial && name === 'a' ? ' {{a-late}}' : ''} {{${name}-opaque}}`, note: `Note {{${name}-note}} tail` },
    inline: { ...Object.fromEntries(['front', 'back', 'note', ...(partial && name === 'a' ? ['late'] : [])].map(side => [`${name}-${side}`,
      { type: 'presentation-fixture-widget', dataVersion: 1, data: { label: `${name}-${side}` } }])),
      [`${name}-opaque`]: { type: 'unregistered-presentation-widget', dataVersion: 9, data: { label: 'keep opaque' } } } }))
}
function expected(failed, reports, partial = false) {
  return { saved: doc(partial), history: [false, false, 0], mode: false,
    a: { editable: failed ? 'false' : 'true', empty: failed, known: !failed, opaque: !failed },
    b: { editable: 'true', known: true, opaque: true },
    siblings: [0, 1].map(() => ({ same: true, connected: true, live: true, task: true })),
    diagnostics: Array.from({ length: reports }, () => ({ contentFree: true, frozen: true })), capHit: false }
}
async function scenario(name, options, operation) {
  test(name, async () => {
    const h = createPresentationNativeFixture(options)
    try {
      await settle()
      const original = ['a-note', 'b-note'].map(id => ({ widget: h.latest(id), task: h.latest(id).context.beginTask() }))
      await operation(h, original)
    } finally {
      h.dispose()
      equal([!h.holder.isConnected, all(h.state.created.map(item => item.context.signal.aborted)),
        all(h.state.blocks.map(item => item.context.signal.aborted)),
        all(h.state.created.map(item => h.state.destroyed.filter(value => value === item).length === 1)),
        all(h.state.blocks.map(item => h.state.blockDestroyed.filter(value => value === item).length === 1))], [true, true, true, true, true])
    }
  })
}

scenario('standalone public healthy batch preserves exact independent owners', {}, async (h, original) => {
  h.panels.get('a').button('back').click(); h.panels.get('b').button('back').click()
  await settle()
  equal(inspect(h, original), expected(false, 0))
  let producers = 0
  equal(original.map(entry => entry.task.commit(data => { producers++; return data })), [true, true])
  equal(producers, 2)
  equal(inspect(h, original), expected(false, 0))
})

for (const kind of ['decode', 'create']) for (const failures of [1, 2, 'persistent']) for (const delivery of ['observer', 'query']) {
  scenario(`standalone public ${kind} ${failures} via ${delivery} settles independently and retries explicitly`, {}, async (h, original) => {
    h.arm(kind, 'a-back', failures)
    const count = failures === 'persistent' ? 3 : failures
    for (let index = 0; index < count; index++) {
      h.panels.get('a').button('back').click()
      if (!index) h.panels.get('b').button('back').click()
      if (delivery === 'query') { try { h.editor.blocks.focus('a', { fieldKey: 'note', offset: 1 }) } catch {} }
      await settle()
      equal(inspect(h, original), expected(true, index + 1))
      equal(h.state.attempts.filter(item => item.kind === kind && item.label === 'a-back' && item.armed).length, index + 1)
      const before = h.state.attempts.length
      for (let query = 0; query < 3; query++) h.editor.blocks.focus('a', { fieldKey: 'note', offset: 1 })
      await settle()
      equal(h.state.attempts.length - before, 0)
      equal(inspect(h, original), expected(true, index + 1))
    }
    h.disarm(kind, 'a-back')
    h.panels.get('a').button('back').click(); await settle()
    equal(inspect(h, original), expected(false, count))
    let producers = 0
    equal(original.map(entry => entry.task.commit(data => { producers++; return data })), [true, true])
    equal(producers, 2)
    equal(inspect(h, original), expected(false, count))
  })
}

scenario('standalone public partial acquisition releases candidates before explicit recovery', { partialFailure: true }, async (h, original) => {
  h.arm('create', 'a-late')
  h.panels.get('a').button('back').click(); h.panels.get('b').button('back').click(); await settle()
  equal(inspect(h, original), expected(true, 1, true))
  const partial = h.latest('a-back')
  equal([!!partial, partial.context.signal.aborted, !partial.element.isConnected,
    h.state.destroyed.filter(item => item === partial).length], [true, true, true, 1])
  h.panels.get('a').button('back').click(); await settle()
  equal(inspect(h, original), expected(false, 1, true))
  equal([h.latest('a-back') !== partial, partial.context.signal.aborted, h.latest('a-late').element.isConnected,
    h.state.destroyed.filter(item => item === partial).length], [true, true, true, 1])
})

for (const [tag, value] of [['undefined', undefined], ['null', null], ['false', false], ['0', 0], ['', ''], ['NaN', NaN]]) {
  scenario(`standalone public descriptor throw ${tag} reports once without discarding B`, {}, async (h, original) => {
    h.state.descriptorFailure = { value, remaining: 1 }
    const marker = document.createComment('delivery'); h.panels.get('a').root.append(marker); marker.remove()
    h.panels.get('b').button('back').click(); await settle()
    equal(h.state.descriptorFailure.remaining, 0)
    equal(h.state.diagnostics.filter(item => item.operation === 'projection.presentation').length, 1)
    equal([h.latest('b-back').element.isConnected, !!h.panels.get('b').field().querySelector('[data-oe-opaque-inline="b-opaque"]')], [true, true])
    equal(h.editor.save().blocks, doc())
    equal([h.editor.canUndo, h.editor.canRedo, h.state.transactions.length], [false, false, 0])
    equal(original.map((entry, index) => [h.latest(['a-note', 'b-note'][index]) === entry.widget, !entry.widget.context.signal.aborted, !entry.task.signal.aborted]),
      [[true, true, true], [true, true, true]])
  })
}

await run()
