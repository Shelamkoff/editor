import { createPresentationOwnerFixture } from './presentation-fixture.js'
import { test, assert, equal, pause } from './harness.js'

test('failed owner with no retained fields retires its block scope after shell adoption', async () => {
  const h = createPresentationOwnerFixture(), foreign = document.createElement('aside')
  document.body.append(foreign)
  try {
    await pause(20)
    const before = h.runtime.save().blocks, version = [h.runtime.generation, h.runtime.revision]
    const panel = h.panels.get('a'), blockTask = panel.context.beginTask(), bTask = h.latest('b-note').context.beginTask()
    panel.note.firstChild.data += ' unowned change'
    const original = h.arm('create', 'a-back')
    panel.switchTab('back')
    let first
    try { h.reconciler.getEditableFields('a') } catch (error) { first = error }
    assert(first === original, 'The intended ordinary field failure must occur first')
    equal(h.reconciler.getEditableFields('a'), [], 'Precondition: every affected field must be disabled')
    assert(!panel.context.signal.aborted && !blockTask.signal.aborted, 'Contained field failure must retain the still-owned block')
    const shell = panel.root.parentNode
    const sentinel = document.createElement('span'); sentinel.textContent = 'foreign owner'; foreign.append(sentinel, shell)
    const html = foreign.innerHTML, children = [...foreign.childNodes]
    let error, fields
    try { fields = h.reconciler.getEditableFields('a') } catch (caught) { error = caught }
    assert(!fields?.length, 'An adopted failed shell must not return authoring fields')
    assert(panel.context.signal.aborted && blockTask.signal.aborted, 'Adopted empty failed owner kept its block scope or task')
    let producerCalls = 0
    equal(blockTask.commit(data => { producerCalls++; return data }), false, 'A retired task must return false')
    equal(producerCalls, 0, 'Retired block task must not enter its producer')
    equal(foreign.innerHTML, html, 'Retirement must leave adopted foreign DOM unchanged')
    assert(foreign.childNodes.length === children.length && children.every((node, index) => foreign.childNodes[index] === node), 'Retirement must keep exact foreign children in place')
    assert(shell.parentNode === foreign && !h.reconciler.ids.includes('a'), 'Only the lost editor owner should retire')
    assert(!bTask.signal.aborted, 'Independent B task must remain live')
    equal(h.runtime.save().blocks, before)
    equal([h.runtime.generation, h.runtime.revision], version)
    assert(!h.runtime.canUndo && h.state.transactions.length === 0, 'Retirement must not author history')
    assert(error instanceof AggregateError && error.cause === original, 'Lost failed owner must report an explicit outcome preserving its first cause')
  } finally { h.dispose(); foreign.remove() }
})
