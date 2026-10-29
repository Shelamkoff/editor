import { createPresentationOwnerFixture } from './presentation-fixture.js'
import { test, assert, equal, pause } from './harness.js'

for (const kind of ['editable', 'widget']) test(`mode callback cannot republish a field adopted by a new ${kind} owner`, async () => {
  const h = createPresentationOwnerFixture()
  try {
    await pause(20)
    const before = h.runtime.save().blocks, version = [h.runtime.generation, h.runtime.revision]
    const field = h.panels.get('a').note, oldWidget = h.latest('a-note'), task = oldWidget.context.beginTask()
    let adopted = false
    h.state.onBlockMode = (value, panel) => {
      if (!value || adopted || panel !== h.panels.get('a')) return
      adopted = true
      const parent = document.createElement('div')
      if (kind === 'editable') parent.contentEditable = 'true'; else parent.dataset.inlinePlugin = 'foreign-control'
      panel.root.append(parent); parent.append(field)
    }
    let failure
    try { h.runtime.setReadOnly(true) } catch (error) { failure = error }
    assert(adopted, 'The mode callback must move the exact previously accepted field')
    assert(failure instanceof Error, 'The mode owner must reject adopted field ownership')
    assert(!h.reconciler.getEditableFields('a').some(item => item.element === field), 'Mode projection republished the moved field')
    assert(h.reconciler.resolveEditableTarget(field) === null, 'The old field regained authoring authority')
    assert(oldWidget.context.signal.aborted && task.signal.aborted, 'The old inline scope/task must remain retired')
    assert(h.latest('a-note').element !== oldWidget.element && h.latest('a-note').element.isConnected,
      'Mode recovery must publish fresh coherent occurrences')
    assert(!h.runtime.readOnly && h.runtime.health === 'ready', 'Successful recovery must restore the prior mode')
    equal(h.runtime.save().blocks, before)
    equal([h.runtime.generation, h.runtime.revision], version)
    assert(!h.runtime.canUndo && h.state.transactions.length === 0, 'Mode recovery cannot create history')
  } finally { h.dispose() }
})

test('mode-only toggle on the same owned ancestor retains its existing field and scope', async () => {
  const h = createPresentationOwnerFixture({ modeAncestor: true })
  try {
    await pause(20)
    const field = h.panels.get('a').note, widget = h.latest('a-note'), task = widget.context.beginTask()
    const before = h.runtime.save().blocks, version = [h.runtime.generation, h.runtime.revision]
    h.runtime.setReadOnly(true); h.runtime.setReadOnly(false)
    assert(h.panels.get('a').note === field && h.latest('a-note').element === widget.element, 'Benign mode change replaced its owner')
    assert(!widget.context.signal.aborted && task.signal.aborted, 'Existing mode cancellation must preserve the occurrence but cancel the old task')
    let calls = 0
    assert(widget.context.beginTask().commit(data => { calls++; return data }) === true && calls === 1, 'The same healthy occurrence must admit a fresh task')
    equal(h.runtime.save().blocks, before)
    equal([h.runtime.generation, h.runtime.revision], version)
    assert(!h.runtime.canUndo && h.state.transactions.length === 0)
  } finally { h.dispose() }
})
