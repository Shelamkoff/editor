import { createPresentationOwnerFixture } from './presentation-fixture.js'
import { test, assert, equal, pause } from './harness.js'

for (const recoveryFails of [false, true]) test('mode ownership recovery after inverse callback failure ' + (recoveryFails ? 'enters the declared failed state when reconstruction fails' : 'restores actual inline modes'), async () => {
  const h = createPresentationOwnerFixture()
  try {
    await pause(20)
    const cause = h.arm('create', 'a-back')
    h.panels.get('a').switchTab('back')
    let initial
    try { h.reconciler.getEditableFields('a') } catch (error) { initial = error }
    assert(initial === cause)
    const field = h.panels.get('a').note, oldWidget = h.latest('a-note'), task = oldWidget.context.beginTask()
    const before = h.runtime.save().blocks, version = [h.runtime.generation, h.runtime.revision]
    const inverseError = new Error('controlled inverse inline mode failure')
    const restoreError = new Error('controlled reconstruction acquisition failure')
    let adopted = false, inverseThrew = false, recoveryContext
    h.state.onCreate = (id, data, context) => {
      if (recoveryFails && inverseThrew && id === 'a-front') { recoveryContext = context; throw restoreError }
    }
    h.state.onInlineMode = (value, instance) => {
      if (adopted && !value && instance.id === 'b-note' && !inverseThrew) {
        inverseThrew = true
        throw inverseError
      }
      if (!value || adopted || instance.id !== 'a-note') return
      adopted = true
      const parent = document.createElement('div'); parent.contentEditable = 'true'
      h.panels.get('a').root.append(parent); parent.append(field)
    }
    let failure
    try { h.runtime.setReadOnly(true) } catch (error) { failure = error }
    assert(adopted && inverseThrew && failure instanceof Error, 'Both final ownership loss and inverse callback failure must occur')
    if (recoveryFails) {
      assert(failure instanceof AggregateError, 'Failed reconstruction must preserve all mode failures')
      assert(failure.errors.length === 3 && failure.errors[0] === h.state.reports.at(-1)
        && failure.errors[1] === inverseError && failure.errors[2] === restoreError,
      'Original boundary, inverse, and acquisition causes retain exact identities and order')
      assert(h.runtime.health === 'failed' && !h.runtime.readOnly, 'Unrecoverable controls must revoke authoring authority')
      assert(recoveryContext?.signal.aborted, 'Failed reconstruction must retire its provisional scope')
      assert(oldWidget.context.signal.aborted && task.signal.aborted, 'Lost predecessor scope and task remain retired')
      let commits = 0, blocked = false
      assert(task.commit(data => { commits++; return data }) === false && commits === 0)
      try { h.runtime.update('a', current => { commits++; return { data: current.data } }) } catch { blocked = true }
      assert(blocked && commits === 0, 'Failed control authority must reject authoring before producers run')
      equal(h.runtime.save().blocks, before)
      equal([h.runtime.generation, h.runtime.revision], version)
      assert(!h.runtime.canUndo && h.state.transactions.length === 0)
      return
    }
    assert(!h.runtime.readOnly && h.runtime.health === 'ready', 'Successful reconstruction must restore the previous runtime mode')
    assert(oldWidget.context.signal.aborted && task.signal.aborted, 'The displaced predecessor must remain retired')
    assert(h.latest('a-note').element !== oldWidget.element, 'Reconstruction must create a new occurrence')
    const modes = { a: h.latest('a-note').readOnly, b: h.latest('b-note').readOnly }
    assert(modes.a === false && modes.b === false, `Reconstruction must restore actual inline modes: ${JSON.stringify(modes)}`)
    let commits = 0
    assert(h.latest('a-note').context.beginTask().commit(data => { commits++; return data }) === true && commits === 1)
    equal(h.runtime.save().blocks, before)
    equal([h.runtime.generation, h.runtime.revision], version)
    assert(!h.runtime.canUndo && h.state.transactions.length === 0)
  } finally { h.dispose() }
})
