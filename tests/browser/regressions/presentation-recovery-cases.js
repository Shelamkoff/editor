import { documentValidationIssue } from '../../../shared/documentValidationIssue.js'
import { createPresentationOwnerFixture } from './presentation-fixture.js'
import { test, assert, equal, pause } from './harness.js'

const clone = value => structuredClone(value)
const settle = () => pause(30)

function ownerTest(name, options, run) {
  test('presentation recovery: ' + name, async () => {
    const h = createPresentationOwnerFixture(options)
    try { await settle(); await run(h) }
    finally { h.dispose() }
  })
}

function accepted(h) {
  assert(Number.isInteger(h.runtime.generation) && Number.isInteger(h.runtime.revision), 'The real runtime must expose numeric generation and revision')
  return {
    blocks: h.runtime.save().blocks, generation: h.runtime.generation, revision: h.runtime.revision,
    canUndo: h.runtime.canUndo, canRedo: h.runtime.canRedo, health: h.runtime.health,
  }
}

function captureFailure(operation) {
  let failed = false, value
  try { operation() } catch (error) { failed = true; value = error }
  assert(failed, 'The operation must actually fail')
  return value
}

function retained(h) {
  return ['a', 'b'].map(id => {
    const widget = h.latest(id + '-note')
    return { id, field: h.panels.get(id).note, widget, task: widget.context.beginTask() }
  })
}

function assertRetained(h, entries, { tasksCancelled = false } = {}) {
  for (const entry of entries) {
    assert(h.panels.get(entry.id).note === entry.field, 'The unrelated author field stays mounted')
    assert(h.latest(entry.id + '-note') === entry.widget && entry.widget.element.isConnected, 'The unrelated inline occurrence stays mounted')
    assert(!entry.widget.context.signal.aborted, 'The unrelated inline scope stays active')
    equal(entry.task.signal.aborted, tasksCancelled, 'Task cancellation follows the mode owner')
  }
}

function failedAttempts(h, kind, label = 'a-back') {
  return h.state.attempts.filter(item => item.kind === kind && item.label === label && item.armed).length
}

function assertBackReady(h, id = 'a') {
  const field = h.panels.get(id).field(), widget = h.latest(id + '-back')
  assert(h.reconciler.getEditableField(id, 'back')?.element === field, 'The recovered descriptor is authorable')
  assert(widget && field.contains(widget.element) && !widget.context.signal.aborted, 'The registered inline occurrence is coherent')
  equal([...field.querySelectorAll('[data-oe-opaque-inline]')].map(node => node.dataset.oeOpaqueInline), [id + '-opaque'], 'An unregistered occurrence remains opaque')
  equal(field.contentEditable, String(!h.runtime.readOnly))
}

async function assertSettledFailure(h) {
  const field = h.panels.get('a').field(), attempts = h.state.attempts.length, reports = h.state.reports.length
  equal(field.contentEditable, 'false', 'The first failure disables its owned host')
  equal(field.innerHTML, '', 'No partial projection remains in the failed host')
  for (let query = 0; query < 3; query++) {
    equal(h.reconciler.getEditableFields('a').map(item => item.key), ['note'])
    equal(h.reconciler.getEditableField('a', 'back'), undefined)
    assert(h.reconciler.getEditableField('a', 'note')?.element === h.panels.get('a').note)
    equal(h.reconciler.resolveEditableTarget(field), null)
  }
  await settle()
  equal(h.state.attempts.length, attempts, 'An unchanged failed descriptor does not retry hooks')
  equal(h.state.reports.length, reports, 'An unchanged failed descriptor does not repeat its diagnostic')
  assert(!h.state.capHit, 'The harness cap must never stop an automatic retry loop')
}

async function failBack(h, error, { sync = true, batch = false } = {}) {
  const reports = h.state.reports.length
  h.panels.get('a').switchTab('back')
  if (batch) h.panels.get('b').switchTab('back')
  if (sync) assert(captureFailure(() => h.reconciler.getEditableFields('a')) === error, 'Synchronous discovery exposes the original failure')
  await settle()
  equal(h.state.reports.length, reports + 1, 'The failed presentation attempt reports once')
  assert(h.state.reports.at(-1) === error && h.state.reportOriginals.at(-1) === error, 'Reporting preserves the actual original failure')
  if (batch) assertBackReady(h, 'b')
  await assertSettledFailure(h)
}

ownerTest('no-fault observer delivery keeps sibling scopes and hydrates known and opaque fields', {}, async h => {
  const before = accepted(h), healthy = retained(h)
  h.panels.get('a').switchTab('back')
  h.panels.get('b').switchTab('back')
  await settle()
  assertBackReady(h)
  assertBackReady(h, 'b')
  assertRetained(h, healthy)
  equal(h.state.reports, [])
  equal(accepted(h), before)
})

for (const kind of ['decode', 'create']) for (const sync of [true, false]) {
  ownerTest(kind + ' failure through ' + (sync ? 'synchronous query' : 'observer delivery') + ' still completes B', {}, async h => {
    const before = accepted(h), healthy = retained(h), error = h.arm(kind, 'a-back')
    await failBack(h, error, { sync, batch: true })
    equal(failedAttempts(h, kind), 1)
    assertRetained(h, healthy)
    equal(accepted(h), before)
    const diagnostic = h.state.diagnostics.filter(item => item.operation === 'projection.presentation')
    equal(diagnostic.length, 1)
    assert(!JSON.stringify(diagnostic).includes(error.message), 'Diagnostic metadata excludes the error message')
    assert(!JSON.stringify(diagnostic).includes(before.blocks[0].data.note), 'Diagnostic metadata excludes author content')
    if (kind === 'decode') {
      equal(documentValidationIssue(error)?.reason, 'invalid-data')
      equal(h.state.validation.length, 1)
      equal(h.state.validation[0].reason, 'invalid-data')
    }
  })
}

for (const count of [1, 2]) {
  ownerTest(count + ' creation faults require distinct explicit descriptor attempts before recovery', {}, async h => {
    const before = accepted(h), healthy = retained(h), error = h.arm('create', 'a-back', count)
    for (let attempt = 0; attempt < count; attempt++) {
      const previousHost = h.panels.get('a').field()
      await failBack(h, error)
      assert(h.panels.get('a').field() !== previousHost, 'An explicit retry supplies a new descriptor identity')
      equal(failedAttempts(h, 'create'), attempt + 1)
    }
    h.panels.get('a').switchTab('back')
    h.reconciler.getEditableFields('a')
    await settle()
    assertBackReady(h)
    equal(h.state.reports.length, count)
    assertRetained(h, healthy)
    equal(accepted(h), before)
    let producers = 0
    assert(healthy[0].task.commit(data => { producers++; return data }) === true, 'A retained task still has admission')
    equal(producers, 1)
  })
}

for (const kind of ['decode', 'create']) {
  ownerTest('persistent ' + kind + ' failure stays bounded until an explicit disarmed attempt', {}, async h => {
    const before = accepted(h), healthy = retained(h), error = h.arm(kind, 'a-back', 'persistent')
    for (let attempt = 0; attempt < 3; attempt++) {
      await failBack(h, error, { sync: attempt !== 0, batch: attempt === 0 })
      equal(failedAttempts(h, kind), attempt + 1)
    }
    h.disarm(kind, 'a-back')
    h.panels.get('a').switchTab('back')
    h.reconciler.getEditableFields('a')
    await settle()
    assertBackReady(h)
    assert(!h.state.capHit)
    equal(h.state.reports.length, 3)
    assertRetained(h, healthy)
    equal(accepted(h), before)
  })
}

ownerTest('partial inline acquisition retires its candidates exactly once and retries with fresh scopes', { partialFailure: true }, async h => {
  const before = accepted(h), healthy = retained(h), error = h.arm('create', 'a-late')
  await failBack(h, error)
  const partial = h.latest('a-back')
  assert(partial && partial.context.signal.aborted && !partial.element.isConnected)
  equal(h.state.destroyed.filter(instance => instance === partial).length, 1)
  h.panels.get('a').switchTab('back')
  h.reconciler.getEditableFields('a')
  await settle()
  assertBackReady(h)
  assert(h.latest('a-back') !== partial && partial.context.signal.aborted)
  assert(h.panels.get('a').field().contains(h.latest('a-late').element))
  equal(h.state.destroyed.filter(instance => instance === partial).length, 1)
  assertRetained(h, healthy)
  equal(accepted(h), before)
})

for (const value of [undefined, null, false]) {
  ownerTest('an actual descriptor delivery reports ' + String(value) + ' and continues independent B', {}, async h => {
    const before = accepted(h), healthy = retained(h)
    h.state.descriptorFailure = { value, remaining: 1 }
    const marker = document.createComment('one delivered descriptor failure')
    h.panels.get('a').root.append(marker)
    marker.remove()
    h.panels.get('b').switchTab('back')
    await settle()
    equal(h.state.descriptorFailure.remaining, 0, 'The descriptor hook actually delivered its failure')
    equal(h.state.reports.length, 1)
    assert(h.state.reports[0] === value)
    equal(h.state.diagnostics.filter(item => item.operation === 'projection.presentation').length, 1)
    assertBackReady(h, 'b')
    assertRetained(h, healthy)
    equal(accepted(h), before)
  })
}

ownerTest('separate deliveries of the settled original Error are each reported without retrying projection', {}, async h => {
  const before = accepted(h), healthy = retained(h), error = h.arm('create', 'a-back')
  await failBack(h, error)
  for (let delivery = 0; delivery < 2; delivery++) {
    h.state.descriptorFailure = { value: error, remaining: 1 }
    const marker = document.createComment('separate delivered descriptor failure')
    h.panels.get('a').root.append(marker)
    marker.remove()
    await settle()
    equal(h.state.descriptorFailure.remaining, 0)
    equal(h.state.reports.length, delivery + 2)
    assert(h.state.reports.at(-1) === error)
    equal(failedAttempts(h, 'create'), 1)
  }
  await assertSettledFailure(h)
  assertRetained(h, healthy)
  equal(accepted(h), before)
})

ownerTest('a healthy field projection commit preserves failed canonical data and creates one history entry', {}, async h => {
  const error = h.arm('create', 'a-back', 'persistent')
  await failBack(h, error)
  const before = accepted(h), expected = clone(before.blocks), attempts = failedAttempts(h, 'create')
  expected[0].data.note = 'Edited ' + expected[0].data.note
  h.runtime.syncBlockFromProjection('a', () => {
    h.panels.get('a').note.firstChild.data = 'Edited ' + h.panels.get('a').note.firstChild.data
  }, { origin: 'native-input', name: 'presentation.probe', preserveSourceProjection: true })
  await settle()
  equal(h.runtime.save().blocks, expected, 'Only the accepted healthy field changes; failed text and sidecars survive')
  equal(h.runtime.revision, before.revision + 1)
  equal(h.runtime.generation, before.generation)
  equal(h.state.transactions.length, 1)
  equal(failedAttempts(h, 'create'), attempts)
  await assertSettledFailure(h)
  assert(h.runtime.canUndo && !h.runtime.canRedo)
  h.runtime.undo()
  equal(h.runtime.save().blocks, before.blocks)
  assert(!h.runtime.canUndo && h.runtime.canRedo, 'Exactly one Undo restores the accepted predecessor')
  h.runtime.redo()
  equal(h.runtime.save().blocks, expected)
  assert(h.runtime.canUndo && !h.runtime.canRedo)
})

ownerTest('a canonical edit of failed content takes the current transaction failure and rollback', {}, async h => {
  const error = h.arm('create', 'a-back', 'persistent')
  await failBack(h, error)
  const before = accepted(h), attempts = failedAttempts(h, 'create')
  const thrown = captureFailure(() => h.runtime.update('a', current => ({ data: { ...current.data, back: current.data.back + ' changed' } })))
  assert(thrown === error, 'The canonical operation exposes its own actual projection fault')
  equal(failedAttempts(h, 'create'), attempts + 1, 'A changed failed value must attempt projection')
  equal(accepted(h), before, 'The failed canonical edit leaves no data, revision or history effect')
  equal(h.state.transactions.length, 0)
})

for (const change of ['rich-text', 'inline-payload']) {
  ownerTest('a canonical ' + change + ' change recovers the same failed host', {}, async h => {
    const error = h.arm('create', 'a-back')
    await failBack(h, error)
    const before = accepted(h), host = h.panels.get('a').field(), expected = clone(before.blocks)
    if (change === 'rich-text') expected[0].data.back += ' repaired'
    else expected[0].inline['a-back'].data.label = 'a-back repaired'
    if (change === 'rich-text') {
      h.runtime.update('a', current => ({ data: { ...current.data, back: expected[0].data.back } }))
    } else {
      h.runtime.updateInlineWidget('a', 'a-back', data => ({ ...data, label: expected[0].inline['a-back'].data.label }))
    }
    await settle()
    assert(h.panels.get('a').field() === host, 'Canonical recovery reuses its exact host')
    assertBackReady(h)
    equal(h.runtime.save().blocks, expected)
    equal(h.runtime.revision, before.revision + 1)
    equal(h.runtime.generation, before.generation)
    equal(h.state.transactions.length, 1)
    equal(h.state.reports.length, 1, 'A successful recovery does not repeat the earlier failure')
  })
}

for (const modeAncestor of [false, true]) {
  ownerTest('read-only round trip preserves healthy scopes and does not retry the failed host' + (modeAncestor ? ' under its same editable ancestor' : ''), { modeAncestor }, async h => {
    const healthy = retained(h), error = h.arm('create', 'a-back', 'persistent')
    await failBack(h, error)
    const before = accepted(h), attempts = failedAttempts(h, 'create')
    h.runtime.setReadOnly(true)
    h.runtime.setReadOnly(false)
    await settle()
    await assertSettledFailure(h)
    equal(failedAttempts(h, 'create'), attempts)
    assertRetained(h, healthy, { tasksCancelled: true })
    equal(accepted(h), before)
    let producers = 0
    const task = healthy[0].widget.context.beginTask()
    assert(task.commit(data => { producers++; return data }) === true, 'The retained healthy scope can admit a fresh task after mode recovery')
    equal(producers, 1)
    equal(accepted(h), before)
  })
}

for (const variant of ['field', 'wrapper', 'readonly']) {
  ownerTest('a cached failed ' + variant + ' releases its temporary attribute before legitimate same-host reuse', {
    cacheTabs: true, cacheWrappers: variant === 'wrapper', visibleModeOnly: variant === 'readonly',
  }, async h => {
    const healthy = retained(h), error = h.arm('create', 'a-back')
    await failBack(h, error)
    const before = accepted(h), panel = h.panels.get('a'), back = panel.field()
    if (variant === 'readonly') h.runtime.setReadOnly(true)
    panel.switchTab('front')
    h.reconciler.getEditableFields('a')
    await settle()
    equal(back.contentEditable, 'true', 'Closing a retired attribute lease does not retain a stale false value')
    equal(h.reconciler.resolveEditableTarget(back), null, 'A retired host has no authoring authority')
    equal(panel.field().contentEditable, variant === 'readonly' ? 'false' : 'true')
    if (variant === 'readonly') h.runtime.setReadOnly(false)
    panel.switchTab('back')
    h.reconciler.getEditableFields('a')
    await settle()
    assert(panel.field() === back)
    assertBackReady(h)
    assertRetained(h, healthy, { tasksCancelled: variant === 'readonly' })
    equal(accepted(h), before)
  })
}

for (const change of ['attribute', 'field-control', 'wrapper-control', 'foreign-field', 'foreign-wrapper']) {
  ownerTest('a retired cached lease leaves later ' + change + ' ownership untouched', {
    cacheTabs: true, cacheWrappers: change === 'wrapper-control' || change === 'foreign-wrapper',
  }, async h => {
    const healthy = retained(h), error = h.arm('create', 'a-back')
    await failBack(h, error)
    const before = accepted(h), panel = h.panels.get('a'), back = panel.field(), shell = panel.cachedShell('back')
    panel.switchTab('front')
    let foreign
    if (change.startsWith('foreign-')) { foreign = document.createElement('aside'); foreign.append(shell) }
    if (change === 'attribute') back.contentEditable = 'plaintext-only'
    if (change === 'field-control') back.setAttribute('role', 'textbox')
    if (change === 'wrapper-control') shell.setAttribute('role', 'textbox')
    const expectedMode = back.contentEditable
    h.reconciler.getEditableFields('a')
    await settle()
    equal(back.contentEditable, expectedMode, 'A superseded attribute or control is not reclaimed')
    equal(h.reconciler.resolveEditableTarget(back), null)
    if (foreign) assert(shell.parentNode === foreign)
    if (change === 'field-control') equal(back.getAttribute('role'), 'textbox')
    if (change === 'wrapper-control') equal(shell.getAttribute('role'), 'textbox')
    assertRetained(h, healthy)
    equal(accepted(h), before)
  })
}

ownerTest('containment failure preserves the original cause and never reclaims a foreign failed host', {}, async h => {
  const before = accepted(h), healthy = retained(h), error = h.arm('create', 'a-back')
  const foreign = document.createElement('aside')
  h.state.onCreate = id => { if (id === 'a-back') foreign.append(h.panels.get('a').field()) }
  h.panels.get('a').switchTab('back')
  const thrown = captureFailure(() => h.reconciler.getEditableFields('a'))
  assert(thrown instanceof AggregateError && thrown.cause === error && thrown.errors[0] === error)
  equal(thrown.errors.length, 2)
  await settle()
  assert(h.panels.get('a').field().parentNode === foreign)
  equal(h.reconciler.resolveEditableTarget(h.panels.get('a').field()), null)
  assertRetained(h, healthy)
  equal(h.state.reports.length, 1)
  assert(h.state.reports[0] === thrown && h.state.reportOriginals[0] === error)
  equal(accepted(h), before)
})

for (const adoption of ['field', 'shell']) {
  ownerTest('failed-candidate destroy cannot reauthorize an adopted ' + adoption, { partialFailure: true }, async h => {
    const before = accepted(h), healthy = retained(h), error = h.arm('create', 'a-late')
    const foreign = document.createElement('aside')
    try {
      h.state.onWidgetDestroy = instance => {
        if (instance.id !== 'a-back') return
        const panel = h.panels.get('a')
        if (adoption === 'field') { foreign.contentEditable = 'true'; panel.root.append(foreign); foreign.append(panel.note) }
        else { document.body.append(foreign); foreign.append(panel.root.parentNode) }
      }
      h.panels.get('a').switchTab('back')
      h.panels.get('b').switchTab('back')
      const thrown = captureFailure(() => h.reconciler.getEditableFields('a'))
      assert(thrown === error || thrown instanceof AggregateError && thrown.cause === error)
      await settle()
      equal(h.reconciler.getEditableField('a', 'note'), undefined)
      assert(healthy[0].widget.context.signal.aborted && healthy[0].task.signal.aborted)
      assertRetained(h, [healthy[1]])
      assertBackReady(h, 'b')
      if (adoption === 'shell') {
        assert(h.panels.get('a').context.signal.aborted)
        assert(!h.reconciler.ids.includes('a'))
      }
      equal(accepted(h), before)
    } finally { foreign.remove() }
  })
}

ownerTest('terminal shell loss keeps accepted A and allows one later canonical acquisition in document order', {}, async h => {
  const before = accepted(h), healthy = retained(h), oldPanel = h.panels.get('a'), error = h.arm('create', 'a-back')
  const foreign = document.createElement('aside')
  try {
    h.state.onCreate = id => {
      if (id !== 'a-back') return
      document.body.append(foreign)
      foreign.append(h.panels.get('a').root.parentNode)
    }
    oldPanel.switchTab('back')
    const thrown = captureFailure(() => h.reconciler.getEditableFields('a'))
    assert(thrown instanceof AggregateError && thrown.cause === error)
    await settle()
    assert(oldPanel.context.signal.aborted && healthy[0].widget.context.signal.aborted && healthy[0].task.signal.aborted)
    equal(h.reconciler.ids, ['b'])
    assertRetained(h, [healthy[1]])
    equal(accepted(h), before)
    const expected = clone(before.blocks)
    expected[0].data.note += ' recovered'
    h.runtime.update('a', current => ({ data: { ...current.data, note: expected[0].data.note } }))
    await settle()
    equal(h.runtime.save().blocks, expected)
    equal([...h.holder.querySelectorAll('.oe-block')].map(element => element.dataset.blockId), ['a', 'b'])
    assert(h.panels.get('a') !== oldPanel && h.panels.get('a').context.restoring)
    assert(oldPanel.context.signal.aborted, 'The predecessor is never revived')
    assertRetained(h, [healthy[1]])
    equal(h.runtime.revision, before.revision + 1)
    equal(h.state.transactions.length, 1)
  } finally { foreign.remove() }
})
