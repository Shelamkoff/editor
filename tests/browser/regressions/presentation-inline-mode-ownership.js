import { createPresentationOwnerFixture } from './presentation-fixture.js'
import { test, assert, equal, pause } from './harness.js'

for (const kind of ['editable', 'widget']) test(`settled failed sibling cannot bypass a new ${kind} owner from a final inline mode callback`, async () => {
  const h = createPresentationOwnerFixture()
  try {
    await pause(20)
    const cause = h.arm('create', 'a-back')
    h.panels.get('a').switchTab('back')
    let initial
    try { h.reconciler.getEditableFields('a') } catch (error) { initial = error }
    assert(initial === cause, 'The original field failure must be contained first')
    const field = h.panels.get('a').note, widget = h.latest('a-note'), task = widget.context.beginTask()
    assert(h.reconciler.getEditableFields('a').length === 1 && !task.signal.aborted, 'The healthy note must own its settled field and task')
    const before = h.runtime.save().blocks, version = [h.runtime.generation, h.runtime.revision]
    let adopted = false, decoding = false
    h.state.onInlineMode = (value, instance) => {
      if (!value || !decoding || adopted || instance.id !== 'a-note') return
      adopted = true
      const parent = document.createElement('div')
      if (kind === 'editable') parent.contentEditable = 'true'; else parent.dataset.inlinePlugin = 'foreign-control'
      h.panels.get('a').root.append(parent); parent.append(field)
    }
    let failure
    decoding = true
    try { h.runtime.setReadOnly(true) } catch (error) { failure = error }
    decoding = false
    const observation = {
      adopted, rejected: failure instanceof Error, readOnly: h.runtime.readOnly, health: h.runtime.health,
      oldScopeAborted: widget.context.signal.aborted, oldTaskAborted: task.signal.aborted,
      freshOccurrence: h.latest('a-note').element !== widget.element,
    }
    assert(adopted, 'The captured inline mode method must move the exact accepted note during final mode propagation')
    assert(failure instanceof Error, `The settled mode path must reject adopted ownership: ${JSON.stringify(observation)}`)
    assert(!h.reconciler.getEditableFields('a').some(item => item.element === field), 'The adopted field cannot be returned as an editable descriptor')
    assert(h.reconciler.resolveEditableTarget(field) === null, 'The adopted field cannot resolve to its old owner')
    assert(widget.context.signal.aborted && task.signal.aborted, 'The old occurrence and its task must retire')
    assert(h.latest('a-note').element !== widget.element && h.latest('a-note').element.isConnected, 'Mode rollback must publish a fresh coherent occurrence')
    assert(!h.runtime.readOnly && h.runtime.health === 'ready', 'Mode rollback must restore the original ready mode')
    assert(h.latest('a-note').readOnly === false && h.latest('b-note').readOnly === false, 'Recovered inline instances must receive the original mode')
    let commits = 0
    assert(h.latest('a-note').context.beginTask().commit(data => { commits++; return data }) === true && commits === 1, 'A fresh recovered occurrence must admit a task')
    equal(h.runtime.save().blocks, before)
    equal([h.runtime.generation, h.runtime.revision], version)
    assert(!h.runtime.canUndo && h.state.transactions.length === 0, 'Presentation and mode recovery cannot create history')
  } finally { h.dispose() }
})
