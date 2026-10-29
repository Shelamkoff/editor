import { DocumentStore } from '../../../core/DocumentStore.js'
import { createCompletionFixture } from './field-projection-completion-fixture.js'
import { test, assert, equal, pause } from './harness.js'

const completed = h => h.state.completions.map(item => [item.name, item.key, item.text])
const accepted = h => ({ blocks: h.runtime.save().blocks, revision: h.runtime.revision,
  canUndo: h.runtime.canUndo, canRedo: h.runtime.canRedo, readOnly: h.runtime.readOnly, health: h.runtime.health })
function captureFailure(operation) {
  let failed = false, value
  try { operation() } catch (error) { failed = true; value = error }
  assert(failed, 'The operation must actually fail')
  return value
}

test('field completion observes mounted connected-widget labels with an exact frozen descriptor', () => {
  const h = createCompletionFixture({ connectedWidget: true })
  try {
    h.mount()
    assert(h.latest('a-front').element.dataset.connected === 'yes', 'The real custom-element connection must run')
    equal(completed(h), [
      ['a', 'front', 'Front a-front connected'], ['a', 'note', 'Note a-note connected tail'],
      ['b', 'front', 'Front b-front connected'], ['b', 'note', 'Note b-note connected tail'],
    ], 'Completion must follow attachment and complete inline projection')
    assert(h.state.completions.every(item => item.connected && item.frozen && item.receiver))
    for (const item of h.state.completions) {
      const panel = h.panels.get(item.name)
      assert(item.element === (item.key === 'note' ? panel.note : panel.field()), 'Completion used an obsolete or unrelated field')
      equal(item.field.mode, 'rich-text')
    }
    equal(h.panels.get('a').derived.get('front').textContent, 'Front a-front connected')
    equal(h.state.transactions.length, 0)
    assert(!h.runtime.canUndo)
  } finally { h.dispose() }
})

test('field completion does not run on a prepared candidate that is discarded', () => {
  const h = createCompletionFixture()
  let prepared
  try {
    h.mount()
    const store = new DocumentStore({ version: '2.0.0', blocks: h.records })
    const draft = store.createDraft()
    const candidate = structuredClone(h.records[0])
    candidate.id = 'candidate'; candidate.data.name = 'candidate'
    draft.insert(2, candidate)
    const before = h.state.completions.length
    prepared = h.reconciler.prepare({ store, draft, changes: draft.changes, generation: store.generation, origin: 'api' })
    const staged = h.state.instances.at(-1)
    assert(staged.name === 'candidate' && !staged.panel.root.isConnected && !staged.context.signal.aborted)
    equal(h.state.completions.length, before, 'Detached preparation delivered completion')
    prepared.discard()
    assert(staged.context.signal.aborted)
    equal(h.state.completions.length, before, 'Discarded occurrence received completion')
    equal(h.runtime.save().blocks, h.records)
  } finally { prepared?.discard(); h.dispose() }
})

test('field completion captures its method getter once and keeps the original receiver', () => {
  const h = createCompletionFixture()
  try {
    h.mount()
    const instance = h.state.instances.find(item => item.name === 'a')
    equal(instance.getterReads, 1, 'The optional method was not captured exactly once')
    Object.defineProperty(instance.source, 'afterProjection', { value() { h.state.poisonCalls++ }, configurable: true })
    h.state.completions.length = 0
    h.runtime.update('a', current => ({ data: { ...current.data, front: 'Changed {{a-front}}' } }))
    equal(completed(h), [['a', 'front', 'Changed a-front']])
    assert(h.state.completions[0].receiver && h.state.completions[0].element === h.panels.get('a').field())
    equal([instance.getterReads, h.state.poisonCalls], [1, 0])
  } finally { h.dispose() }
})

test('field completion settles a sidecar-only edit and each exact history replay before acceptance', async () => {
  const h = createCompletionFixture()
  try {
    h.mount(); await pause()
    const before = accepted(h), snapshots = [], front = h.panels.get('a').field(), note = h.latest('a-note')
    h.state.completions.length = 0
    h.state.onCompletion = notice => snapshots.push({ name: notice.name, key: notice.key,
      label: h.runtime.save().blocks[0].inline['a-front'].data.label, revision: h.runtime.revision,
      transactions: h.state.transactions.length })
    h.latest('a-front').context.updateData(current => ({ ...current, label: 'Changed' }))
    const changed = accepted(h), expected = structuredClone(before.blocks)
    expected[0].inline['a-front'].data.label = 'Changed'
    equal(changed.blocks, expected, 'The real scoped edit must change only its sidecar')
    equal(front.textContent, 'Front Changed')
    assert(h.latest('a-note') === note && !note.context.signal.aborted)
    equal(completed(h), [['a', 'front', 'Front Changed']])
    equal(snapshots, [{ name: 'a', key: 'front', label: 'a-front', revision: before.revision, transactions: 0 }], 'Completion ran after acceptance')
    h.state.completions.length = 0; snapshots.length = 0
    assert(h.runtime.undo())
    equal(h.runtime.save().blocks, before.blocks); assert(!h.runtime.canUndo && h.runtime.canRedo)
    equal(completed(h), [['a', 'front', 'Front a-front']])
    equal(snapshots, [{ name: 'a', key: 'front', label: 'Changed', revision: changed.revision, transactions: 1 }])
    const undoRevision = h.runtime.revision
    h.state.completions.length = 0; snapshots.length = 0
    assert(h.runtime.redo())
    equal(h.runtime.save().blocks, expected); assert(h.runtime.canUndo && !h.runtime.canRedo)
    equal(completed(h), [['a', 'front', 'Front Changed']])
    equal(snapshots, [{ name: 'a', key: 'front', label: 'a-front', revision: undoRevision, transactions: 2 }])
    equal(h.state.transactions.map(event => event.action), ['commit', 'undo', 'redo'])
    assert(h.panels.get('a').field() === front)
  } finally { h.dispose() }
})

test('field completion observes final inline mode and cancellation effects before mode acceptance', async () => {
  const h = createCompletionFixture()
  try {
    h.mount(); await pause()
    const before = accepted(h), widget = h.latest('a-front'), task = widget.context.beginTask(), observedModes = []
    h.state.onInlineMode = (value, instance) => { instance.element.textContent = (value ? 'R:' : 'E:') + instance.context.getData().label }
    task.signal.addEventListener('abort', () => { widget.element.textContent = 'Cancelled:a-front' }, { once: true })
    h.state.onCompletion = () => observedModes.push(h.runtime.readOnly)
    h.state.completions.length = 0
    h.runtime.setReadOnly(true)
    assert(task.signal.aborted && h.runtime.readOnly)
    equal(widget.element.textContent, 'Cancelled:a-front', 'The real task cancellation must run after the inline mode callback')
    equal(completed(h), [
      ['a', 'front', 'Front Cancelled:a-front'], ['a', 'note', 'Note R:a-note tail'],
      ['b', 'front', 'Front R:b-front'], ['b', 'note', 'Note R:b-note tail'],
    ])
    equal(observedModes, [false, false, false, false], 'The mode was accepted before completion')
    h.state.completions.length = 0; observedModes.length = 0
    h.runtime.setReadOnly(false)
    equal(completed(h), [
      ['a', 'front', 'Front E:a-front'], ['a', 'note', 'Note E:a-note tail'],
      ['b', 'front', 'Front E:b-front'], ['b', 'note', 'Note E:b-note tail'],
    ])
    equal(observedModes, [true, true, true, true])
    equal(accepted(h), before)
    equal(h.state.transactions, [])
  } finally { h.dispose() }
})

for (const synchronous of [true, false]) test(`field completion ${synchronous ? 'query' : 'observer'} failure is field-local and retries only a new explicit descriptor`, async () => {
  const h = createCompletionFixture(), fault = new Error('controlled completion failure')
  try {
    h.mount(); await pause()
    const before = accepted(h), note = h.latest('a-note'), task = note.context.beginTask(), independent = h.latest('b-note')
    let armed = true
    h.state.onCompletion = notice => { if (armed && notice.name === 'a' && notice.key === 'back') { armed = false; throw fault } }
    h.state.completions.length = 0
    h.panels.get('a').switchTab('back'); h.panels.get('b').switchTab('back')
    const failedHost = h.panels.get('a').field()
    if (synchronous) assert(captureFailure(() => h.reconciler.getEditableFields('a')) === fault)
    await pause(30)
    assert(!armed, 'The attempted callback did not run')
    equal(h.state.reports.length, 1)
    assert(h.state.reports[0] === fault && h.state.reportOriginals[0] === fault)
    equal(failedHost.innerHTML, ''); equal(failedHost.contentEditable, 'false')
    equal(h.reconciler.getEditableFields('a').map(field => field.key), ['note'])
    assert(h.panels.get('b').field().contains(h.latest('b-back').element), 'Independent B did not complete')
    equal(h.panels.get('b').derived.get('back').textContent, h.panels.get('b').field().textContent)
    assert(h.latest('a-note') === note && !note.context.signal.aborted && !task.signal.aborted)
    assert(h.latest('b-note') === independent && !independent.context.signal.aborted)
    equal(completed(h).map(([id, key]) => [id, key]), [['a', 'back'], ['b', 'back']])
    const calls = h.state.completions.length
    for (let index = 0; index < 3; index++) h.reconciler.getEditableFields('a')
    await pause(30)
    equal(h.state.completions.length, calls, 'Settled failed queries retried completion')
    equal(h.state.reports.length, 1)
    equal(accepted(h), before)
    h.panels.get('a').switchTab('back'); h.reconciler.getEditableFields('a'); await pause(20)
    const nextHost = h.panels.get('a').field()
    assert(nextHost !== failedHost && h.reconciler.getEditableField('a', 'back').element === nextHost)
    equal(nextHost.contentEditable, 'true')
    equal(h.panels.get('a').derived.get('back').textContent, nextHost.textContent)
    equal(h.state.completions.length, calls + 1)
    equal(accepted(h), before)
  } finally { h.dispose() }
})

test('field completion is not delivered for a field whose inline hydration fails', async () => {
  const h = createCompletionFixture()
  try {
    h.mount(); await pause()
    const before = accepted(h), note = h.latest('a-note'), fault = h.arm('create', 'a-back')
    h.state.completions.length = 0
    h.panels.get('a').switchTab('back')
    assert(captureFailure(() => h.reconciler.getEditableFields('a')) === fault)
    await pause(20)
    equal(h.state.completions, [], 'A failed or untouched field received completion')
    equal(h.panels.get('a').field().innerHTML, '')
    equal(h.reconciler.getEditableFields('a').map(field => field.key), ['note'])
    assert(h.latest('a-note') === note && !note.context.signal.aborted)
    equal(accepted(h), before)
  } finally { h.dispose() }
})

test('field completion follows an unchanged-canonical field rewritten by block update without replaying its untouched sibling', async () => {
  const h = createCompletionFixture({ repaintFrontOnUpdate: true })
  try {
    h.mount(); await pause()
    const before = h.runtime.save().blocks, note = h.panels.get('a').note
    const noteWidget = h.latest('a-note'), task = noteWidget.context.beginTask()
    h.state.completions.length = 0
    h.runtime.update('a', current => ({ data: { ...current.data, metadata: 'new presentation' } }))
    equal(h.runtime.save().blocks[0].data.front, before[0].data.front, 'This control must keep canonical rich text unchanged')
    equal(completed(h), [['a', 'front', 'Front a-front']], 'Rewritten DOM needs completion; untouched note does not')
    assert(h.panels.get('a').note === note && h.latest('a-note') === noteWidget && !task.signal.aborted)
    const count = h.state.completions.length
    for (let index = 0; index < 3; index++) h.reconciler.getEditableFields('a')
    await pause()
    equal(h.state.completions.length, count, 'Healthy queries or observer deliveries repeated completion')
  } finally { h.dispose() }
})

test('field completion getter failure cleans up the captured instance before publication', () => {
  const fault = new Error('controlled completion getter failure'), h = createCompletionFixture({ getterFailure: fault })
  try {
    assert(captureFailure(() => h.mount()) === fault)
    equal(h.state.instances.length, 1)
    const occurrence = h.state.instances[0]
    equal(occurrence.getterReads, 1)
    assert(occurrence.context.signal.aborted && !occurrence.panel.root.isConnected)
    equal(h.state.blockDestroyed.filter(panel => panel === occurrence.panel).length, 1)
    equal(h.state.completions, [])
    equal(h.holder.childNodes.length, 0)
  } finally { h.dispose() }
})

for (const phase of ['initial', 'canonical']) for (const kind of ['Error', 'undefined', 'thenable']) {
  test(`field completion ${phase} ${kind} failure preserves its original failure and accepted boundary`, async () => {
    const h = createCompletionFixture(), fault = new Error('controlled completion body failure')
    let armed = true, thenReads = 0, thenCalls = 0
    const result = function () {}
    Object.defineProperty(result, 'then', { get() { thenReads++; return (_resolve, reject) => { thenCalls++; reject(fault) } } })
    const failOnce = notice => {
      if (!armed || notice.name !== 'a' || notice.key !== 'front') return
      armed = false
      if (kind === 'thenable') return result
      throw kind === 'Error' ? fault : undefined
    }
    try {
      let before, thrown
      if (phase === 'initial') {
        h.state.onCompletion = failOnce
        thrown = captureFailure(() => h.mount())
      } else {
        h.mount(); await pause()
        before = accepted(h)
        h.state.onCompletion = failOnce
        thrown = captureFailure(() => h.runtime.update('a', current => ({ data: { ...current.data, front: 'Changed {{a-front}}' } })))
      }
      assert(!armed, 'The intended callback must deliver the failure')
      if (kind === 'thenable') {
        assert(thrown instanceof TypeError)
        equal(thrown.message, 'Extension operation must complete synchronously')
        await pause()
        equal([thenReads, thenCalls], [1, 1], 'A callable thenable must be rejected with its getter captured once')
      } else assert(thrown === (kind === 'Error' ? fault : undefined), 'The original thrown value was replaced')
      equal(h.state.transactions, [])
      if (phase === 'initial') {
        assert(h.state.instances.length > 0 && h.state.instances.every(item => item.context.signal.aborted && !item.panel.root.isConnected))
        for (const occurrence of h.state.instances) equal(h.state.blockDestroyed.filter(panel => panel === occurrence.panel).length, 1)
        assert(h.state.created.every(instance => instance.context.signal.aborted))
        equal(h.holder.childNodes.length, 0)
      } else {
        equal(accepted(h), before, 'A failed projection changed canonical data, history, revision or health')
        equal(h.panels.get('a').field().textContent, 'Front a-front', 'Recovery did not restore coherent author content')
        equal(h.panels.get('a').derived.get('front').textContent, 'Front a-front', 'Recovery must recompute the derived presentation')
        h.runtime.update('a', current => ({ data: { ...current.data, front: 'Accepted {{a-front}}' } }))
        equal(h.panels.get('a').derived.get('front').textContent, 'Accepted a-front')
        equal(h.state.transactions.length, 1)
        assert(h.runtime.canUndo)
      }
    } finally { h.dispose() }
  })
}

test('field completion mode failure restores coherent fields and accepted mode without restoring cancelled tasks', async () => {
  const h = createCompletionFixture(), fault = new Error('controlled mode completion failure')
  try {
    h.mount(); await pause()
    const before = accepted(h), task = h.latest('a-front').context.beginTask()
    let armed = true
    h.state.onCompletion = notice => {
      if (armed && notice.name === 'a' && notice.key === 'front') { armed = false; throw fault }
    }
    assert(captureFailure(() => h.runtime.setReadOnly(true)) === fault)
    assert(!armed && task.signal.aborted)
    equal(accepted(h), before)
    for (const name of ['a', 'b']) {
      const panel = h.panels.get(name)
      equal(panel.field().textContent, `Front ${name}-front`)
      equal(panel.derived.get('front').textContent, `Front ${name}-front`)
      equal(panel.field().contentEditable, 'true')
      assert(!h.latest(name + '-front').context.isReadOnly())
    }
    equal(h.state.transactions, [])
  } finally { h.dispose() }
})

test('field completion observer preserves an undefined body failure without retrying its settled field', async () => {
  const h = createCompletionFixture()
  try {
    h.mount(); await pause()
    const before = accepted(h)
    let calls = 0
    h.state.onCompletion = notice => { if (notice.name === 'a' && notice.key === 'back') { calls++; throw undefined } }
    h.panels.get('a').switchTab('back'); h.panels.get('b').switchTab('back')
    await pause(30)
    equal(calls, 1, 'The observer must deliver the actual callback failure')
    equal(h.state.reports.length, 1)
    assert(h.state.reports[0] === undefined && h.state.reportOriginals[0] === undefined)
    equal(h.panels.get('a').field().contentEditable, 'false')
    equal(h.panels.get('a').field().innerHTML, '')
    equal(h.panels.get('b').derived.get('back').textContent, h.panels.get('b').field().textContent)
    for (let index = 0; index < 3; index++) h.reconciler.getEditableFields('a')
    await pause(20)
    equal(calls, 1); equal(h.state.reports.length, 1); equal(accepted(h), before)
  } finally { h.dispose() }
})

test('field completion cannot acquire scoped writes, tasks or public mutation and control authority', async () => {
  const h = createCompletionFixture({ publicEditor: true }), foreign = document.createElement('button')
  document.body.append(foreign)
  try {
    h.mount(); await pause()
    const before = h.editor.save().blocks
    foreign.focus()
    let producers = 0, attempted = false
    const denied = []
    const attempt = (name, run) => {
      try { run() } catch (error) { denied.push(name) }
    }
    h.state.onCompletion = notice => {
      if (notice.name !== 'a' || notice.key !== 'front') return
      attempted = true
      const context = notice.occurrence.context
      attempt('scoped-write', () => context.updateData(data => { producers++; return data }))
      attempt('public-write', () => h.editor.blocks.update('b', current => { producers++; return { data: current.data } }))
      attempt('task', () => context.beginTask())
      attempt('block-focus', () => h.editor.blocks.focus('b'))
      attempt('focus', () => h.editor.focus())
      attempt('destroy', () => h.editor.destroy())
    }
    h.editor.blocks.update('a', current => ({ data: { ...current.data, front: 'Changed {{a-front}}' } }))
    assert(attempted, 'The completion boundary was never entered')
    equal(producers, 0)
    assert(denied.includes('task') && denied.includes('destroy'), 'Completion acquired lifetime or task authority')
    assert(document.activeElement === foreign && h.holder.querySelector('.oe-editor'), 'Completion moved focus or destroyed its editor')
    const expected = structuredClone(before); expected[0].data.front = 'Changed {{a-front}}'
    equal(h.editor.save().blocks, expected); equal(h.state.transactions.length, 1)
    assert(h.editor.undo()); equal(h.editor.save().blocks, before); assert(!h.editor.canUndo)
  } finally { h.dispose(); foreign.remove() }
})

test('field completion does not revive a removed instance when history recreates its serialized id', async () => {
  const h = createCompletionFixture()
  try {
    h.mount(); await pause()
    const before = h.runtime.save().blocks, previous = h.state.instances.find(item => item.name === 'a')
    h.state.completions.length = 0
    h.runtime.remove('a')
    assert(previous.context.signal.aborted)
    equal(h.state.completions, [], 'Removing an occurrence completed a retired or untouched field')
    assert(h.runtime.undo()); equal(h.runtime.save().blocks, before)
    const successor = h.state.instances.filter(item => item.name === 'a').at(-1)
    assert(successor !== previous && !successor.context.signal.aborted)
    equal(completed(h), [['a', 'front', 'Front a-front'], ['a', 'note', 'Note a-note tail']])
    assert(h.state.completions.every(item => item.occurrence === successor && item.element !== previous.panel.field() && item.element !== previous.panel.note))
    const count = h.state.completions.length
    h.runtime.destroy(); await pause()
    equal(h.state.completions.length, count, 'Destruction completed the retired occurrence')
    assert(successor.context.signal.aborted)
  } finally { h.dispose() }
})

test('field completion never sees a lease lost in the preceding block-task cancellation callback', async () => {
  const h = createCompletionFixture(), foreign = document.createElement('section')
  foreign.contentEditable = 'true'; document.body.append(foreign)
  try {
    h.mount(); await pause()
    const before = accepted(h), panel = h.panels.get('a'), note = panel.note, widget = h.latest('a-note')
    const task = panel.context.beginTask()
    let moved = false
    task.signal.addEventListener('abort', () => { moved = true; foreign.append(note) }, { once: true })
    h.state.completions.length = 0
    const error = captureFailure(() => h.runtime.setReadOnly(true))
    assert(moved && task.signal.aborted && error instanceof Error)
    assert(widget.context.signal.aborted && note.parentNode === foreign)
    assert(h.state.completions.every(notice => notice.element !== note), 'A post-cancellation callback received a revoked field lease')
    equal(accepted(h), before)
    equal(h.panels.get('a').note.textContent, 'Note a-note tail')
  } finally { h.dispose(); foreign.remove() }
})

for (const moved of ['current', 'sibling']) test(`field completion rejects ${moved} field adoption through its callback without reclaiming the foreign host`, async () => {
  const h = createCompletionFixture(), foreign = document.createElement('section')
  foreign.contentEditable = 'true'; document.body.append(foreign)
  try {
    h.mount(); await pause()
    const before = accepted(h), oldNote = h.latest('a-note'), noteTask = oldNote.context.beginTask()
    let adopted = null, calls = 0
    h.state.onCompletion = (notice, field) => {
      if (notice.name !== 'a' || notice.key !== 'back' || calls++) return
      adopted = moved === 'current' ? field.element : h.panels.get('a').note
      foreign.append(adopted)
    }
    h.panels.get('a').switchTab('back')
    let failed = false
    try { h.reconciler.getEditableFields('a') } catch { failed = true }
    assert(adopted && failed, 'The callback must run and its ownership loss must reject the attempted projection')
    assert(adopted.parentNode === foreign, 'Recovery took back the reassigned field')
    const lost = h.latest(moved === 'current' ? 'a-back' : 'a-note')
    assert(lost.context.signal.aborted, 'The old inline occurrence kept authority after adoption')
    if (moved === 'sibling') assert(noteTask.signal.aborted)
    else assert(!oldNote.context.signal.aborted && !noteTask.signal.aborted)
    await pause(20)
    assert(!h.reconciler.getEditableFields('a').some(field => field.element === adopted))
    equal(accepted(h), before)
    const count = h.state.completions.length
    for (let index = 0; index < 3; index++) h.reconciler.getEditableFields('a')
    await pause(20)
    equal(h.state.completions.length, count)
    assert(adopted.parentNode === foreign)
  } finally { h.dispose(); foreign.remove() }
})
