import { createPresentationOwnerFixture } from './presentation-fixture.js'
import { test, assert, equal, pause } from './harness.js'

for (const withoutInlineProjection of [false, true]) test('mode rejects field adoption by a block task cancellation ' + (withoutInlineProjection ? 'without inline projection' : 'with inline projection'), async () => {
  const h = createPresentationOwnerFixture({ withoutInlineProjection })
  try {
    await pause(20)
    const cause = withoutInlineProjection ? null : h.arm('create', 'a-back')
    h.panels.get('a').switchTab('back')
    let initial
    try { h.reconciler.getEditableFields('a') } catch (error) { initial = error }
    if (withoutInlineProjection) assert(initial === undefined)
    else assert(initial === cause)
    const panel = h.panels.get('a'), field = panel.note, oldWidget = h.latest('a-note')
    const task = panel.context.beginTask(), before = h.runtime.save().blocks, version = [h.runtime.generation, h.runtime.revision]
    let adopted = false
    task.signal.addEventListener('abort', () => {
      adopted = true
      const parent = document.createElement('div'); parent.contentEditable = 'true'
      panel.root.append(parent); parent.append(field)
    }, { once: true })
    let failure
    try { h.runtime.setReadOnly(true) } catch (error) { failure = error }
    assert(adopted && task.signal.aborted, 'The existing mode owner must cancel the real block task')
    assert(failure instanceof Error, 'Ownership changed during mode cancellation must reject the transition')
    assert(panel.context.signal.aborted, 'The displaced block scope must be retired')
    if (!withoutInlineProjection) assert(oldWidget.context.signal.aborted, 'The lost inline occurrence must be retired')
    assert(h.reconciler.resolveEditableTarget(field) === null, 'The adopted field cannot keep authoring authority')
    assert(h.panels.get('a') !== panel && h.panels.get('a').root.isConnected)
    if (!withoutInlineProjection) assert(h.latest('a-note').element !== oldWidget.element && h.latest('a-note').element.isConnected)
    assert(!h.runtime.readOnly && h.runtime.health === 'ready')
    if (!withoutInlineProjection) assert(h.latest('a-note').readOnly === false && h.latest('b-note').readOnly === false)
    let commits = 0
    assert(h.panels.get('a').context.beginTask().commit(data => { commits++; return data }) === true && commits === 1)
    equal(h.runtime.save().blocks, before)
    equal([h.runtime.generation, h.runtime.revision], version)
    assert(!h.runtime.canUndo && h.state.transactions.length === 0)
  } finally { h.dispose() }
})
