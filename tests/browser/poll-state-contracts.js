import { createPollPlugin } from '../../plugins/poll/index.js'
import { DocumentStore } from '../../core/DocumentStore.js'
import { HistoryStore } from '../../core/HistoryStore.js'
import { TransactionEngine } from '../../core/TransactionEngine.js'
import { NativeInputController } from '../../core/NativeInputController.js'

const cases = []
const browserErrors = []
window.addEventListener('error', event => browserErrors.push(String(event.error?.stack ?? event.message)))
window.addEventListener('unhandledrejection', event => browserErrors.push(String(event.reason?.stack ?? event.reason)))
const test = (name, run) => cases.push({ name, run })
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
function equal(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}
function result(revision, a = 7, b = 3, currentUserVote = ['a']) {
  return { revision, total: a + b, options: [{ id: 'a', votes: a }, { id: 'b', votes: b }], currentUserVote }
}

/** Exercise the public block-instance contract with the real canonical/history owners. */
function mount({ seed, remote = true, nativeInput = false, resultsMode = 'always', options = [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] } = {}) {
  const loads = [], subscriptions = [], votes = [], errors = []
  const dataSource = {
    load(request) { return new Promise(resolve => loads.push({ ...request, resolve })) },
    vote(request) { return new Promise(resolve => votes.push({ ...request, resolve })) },
    subscribe(request) {
      const entry = { ...request, releases: 0 }
      subscriptions.push(entry)
      return () => { entry.releases++ }
    },
  }
  const definition = createPollPlugin({
    injectStyles: false,
    ...(remote ? { dataSource } : {}),
    compareRevisions: (next, current) => Number(next) - Number(current),
    onError: error => errors.push(String(error)),
  })
  const initial = definition.schema.encode({
    question: 'Question', type: 'single', options, resultsMode,
    ...(remote ? { pollId: 'poll-1' } : {}),
    ...(seed ? { initialResults: seed } : {}),
  }).data
  const store = new DocumentStore({ version: '2.0.0', blocks: [{ id: 'poll', type: 'poll', dataVersion: 1, data: initial }] })
  const history = new HistoryStore()
  const controller = new AbortController()
  const runtime = definition.setup({ t: (_key, fallback) => fallback })
  let instance, candidate = null, readOnly = false, id = 0
  const engine = new TransactionEngine({
    store, history,
    projector: { prepare({ draft, sourceBlockId }) { return {
      apply() {
        candidate = draft.get('poll').data
        if (sourceBlockId !== 'poll') instance.update(candidate)
      },
      recover() { candidate = null; instance.update(store.get('poll').data) },
      finalize() { candidate = null }, discard() { candidate = null },
    } } },
  })
  const update = producer => engine.execute({ origin: 'plugin', name: 'poll.author-update' }, tx => {
    const record = tx.get('poll')
    const encoded = definition.schema.encode(producer(structuredClone(record.data)))
    tx.update('poll', { ...record, data: encoded.data, dataVersion: encoded.dataVersion })
  })
  instance = runtime.create(initial, {
    ownerDocument: document, signal: controller.signal,
    getData: () => structuredClone(candidate ?? store.get('poll').data),
    isReadOnly: () => readOnly, createId: () => 'created-' + ++id,
    updateData: update,
    commitDomMutation(operation) { operation(); update(() => instance.read()) },
  })
  document.querySelector('#sandbox').append(instance.element)
  const inputController = nativeInput ? new NativeInputController({
    root: instance.element,
    runtime: {
      get readOnly() { return readOnly },
      get generation() { return store.generation },
      get revision() { return store.revision },
      syncBlockFromProjection(id, operation, metadata) {
        operation()
        engine.execute({
          ...metadata,
          sourceBlockId: metadata.preserveSourceProjection ? id : undefined,
        }, tx => {
          const current = tx.get(id)
          const encoded = definition.schema.encode(instance.read())
          tx.update(id, { ...current, data: encoded.data })
        })
      },
    },
    reconciler: {
      resolveEditableTarget(target) {
        const field = instance.editableFields().find(field => field.element === target || field.element.contains(target))
        return field ? { ...field, blockId: 'poll', fieldKey: field.key } : null
      },
    },
  }) : null
  return {
    instance, store, history, engine, loads, subscriptions, votes, errors, update,
    percentages: () => [...instance.element.querySelectorAll('.oe-poll__result-pct')].map(el => el.textContent),
    selected: () => [...instance.element.querySelectorAll('.oe-poll__option-marker[aria-pressed="true"]')].map(el => el.dataset.optionId),
    async resolveLoad(index, value) {
      await tick()
      if (!loads[index]) throw new Error(`Poll load ${index} did not start`)
      loads[index].resolve(value)
      await tick()
    },
    setReadOnly(value) { readOnly = value; instance.setReadOnly(value) },
    destroy() { inputController?.destroy(); instance.destroy(); controller.abort(); runtime.destroy(); instance.element.remove() },
  }
}

for (const field of ['question', 'option']) {
  test(`editing the ${field} does not replace loaded results with an unchanged seed`, async () => {
    const h = mount({ seed: result('1', 2, 8, ['b']) })
    try {
      await h.resolveLoad(0, result('2'))
      const seed = h.store.get('poll').data.initialResults
      equal(h.percentages(), ['70%', '30%'], 'load did not settle')
      equal(h.history.undoDepth, 0, 'remote loading authored a history entry')
      h.update(data => field === 'question' ? { ...data, question: 'Edited' }
        : { ...data, options: data.options.map(option => ({ ...option, text: option.text + ' edited' })) })
      equal(h.percentages(), ['70%', '30%'], 'author edit reset remote counts')
      equal(h.selected(), ['a'], 'author edit reset the acknowledged vote')
      equal(h.store.get('poll').data.initialResults, seed, 'remote results leaked into document data')
      equal(h.loads.length, 1, 'text edit unnecessarily reconnected the data source')
      equal(h.history.undoDepth, 1, 'author edit was not one history entry')
      equal(h.errors, [], 'unexpected poll failure')
    } finally { h.destroy() }
  })
}

test('editing author data preserves the revision that rejects stale subscription results', async () => {
  const h = mount({ seed: result('1', 2, 8, ['b']) })
  try {
    await h.resolveLoad(0, result('2'))
    h.update(data => ({ ...data, question: 'Edited' }))
    h.subscriptions[0].onUpdate(result('1.5', 4, 6, ['b']))
    equal(h.percentages(), ['70%', '30%'], 'stale update replaced the newer acknowledged result')
    equal(h.selected(), ['a'], 'stale update reset the acknowledged vote')
  } finally { h.destroy() }
})

test('switching poll identity accepts the new poll revision independently of the previous poll', async () => {
  const h = mount()
  try {
    await h.resolveLoad(0, result('20'))
    h.update(data => ({ ...data, pollId: 'poll-2' }))
    await h.resolveLoad(1, result('1', 4, 6, []))
    equal(h.loads[1].pollId, 'poll-2', 'new identity did not load its own data')
    equal(h.percentages(), ['40%', '60%'], 'old poll revision rejected the new poll result')
    equal(h.selected(), [], 'old identity carried its vote into a new poll')
    equal(h.subscriptions[0].releases, 1, 'old subscription was not released exactly once')
    equal(h.loads[0].signal.aborted, true, 'old connection remained active')
    h.subscriptions[0].onUpdate(result('100', 1, 9, ['b']))
    equal(h.percentages(), ['40%', '60%'], 'old connection changed the new poll')
  } finally { h.destroy() }
})

test('afterVote visibility does not carry an old identity vote into a different poll', async () => {
  const h = mount({ resultsMode: 'afterVote' })
  try {
    await h.resolveLoad(0, result('2'))
    equal(h.percentages(), ['70%', '30%'], 'acknowledged vote did not expose results')
    h.update(data => ({ ...data, pollId: 'poll-2' }))
    // A higher revision isolates visibility from revision-comparison behavior.
    await h.resolveLoad(1, result('3', 4, 6, []))
    equal(h.selected(), [], 'new poll unexpectedly has a selected vote')
    equal(h.percentages(), [], 'new poll exposed afterVote results without a vote')
  } finally { h.destroy() }
})

test('distinct valid option id arrays cannot collide in the connection identity', async () => {
  const h = mount({ options: [{ id: 'a|b', text: 'One' }, { id: 'c', text: 'Two' }] })
  try {
    await h.resolveLoad(0, {
      revision: '1', total: 10,
      options: [{ id: 'a|b', votes: 7 }, { id: 'c', votes: 3 }],
    })
    h.update(data => ({ ...data, options: [{ id: 'a', text: 'One' }, { id: 'b|c', text: 'Two' }] }))
    await tick()
    equal(h.subscriptions.length, 2, 'new option identities did not replace the subscription')
    equal(h.subscriptions[0].releases, 1, 'old option subscription stayed owned')
    equal(h.loads.length, 2, 'new option identities did not load fresh results')
    await h.resolveLoad(1, {
      revision: '2', total: 10,
      options: [{ id: 'a', votes: 4 }, { id: 'b|c', votes: 6 }],
    })
    equal(h.percentages(), ['40%', '60%'], 'new option ids did not receive results')
  } finally { h.destroy() }
})

test('subscription results survive a settings change and its Undo/Redo', async () => {
  const h = mount({ seed: result('1', 2, 8, ['b']) })
  try {
    await h.resolveLoad(0, result('2'))
    h.subscriptions[0].onUpdate(result('3', 9, 1, ['a']))
    h.update(data => ({ ...data, resultsMode: 'afterVote' }))
    equal(h.percentages(), ['90%', '10%'], 'settings change reset live results')
    equal(h.engine.undo(), true, 'settings undo failed')
    equal(h.percentages(), ['90%', '10%'], 'Undo of author settings rolled back runtime results')
    equal(h.engine.redo(), true, 'settings redo failed')
    equal(h.percentages(), ['90%', '10%'], 'Redo of author settings rolled back runtime results')
    equal(h.loads.length, 1, 'settings/history triggered a needless remote load')
    equal(h.store.get('poll').data.initialResults.revision, '1', 'live results became author data')
  } finally { h.destroy() }
})

test('explicitly replacing or removing initial results updates the author-owned snapshot', async () => {
  const h = mount({ remote: false, seed: result('1', 2, 8, ['b']) })
  try {
    h.update(data => ({ ...data, initialResults: result('2', 6, 4, ['a']) }))
    equal(h.percentages(), ['60%', '40%'], 'explicit seed replacement was ignored')
    equal(h.selected(), ['a'], 'explicit seed vote was ignored')
    h.update(data => { delete data.initialResults; return data })
    equal(h.percentages(), ['0%', '0%'], 'explicit seed removal did not clear counts')
    equal(h.selected(), [], 'explicit seed removal did not clear selection')
    equal(h.engine.undo(), true, 'seed removal undo failed')
    equal(h.percentages(), ['60%', '40%'], 'Undo did not restore the author snapshot')
    equal(h.engine.redo(), true, 'seed removal redo failed')
    equal(h.percentages(), ['0%', '0%'], 'Redo did not remove the author snapshot')
  } finally { h.destroy() }
})

test('local voting persists exactly one authored history step and remains undoable', async () => {
  const h = mount({ remote: false })
  try {
    h.instance.element.querySelector('.oe-poll__option-marker').click()
    h.instance.element.querySelector('.oe-poll__submit').click()
    equal(h.percentages(), ['100%', '0%'], 'local vote did not change counts')
    equal(h.history.undoDepth, 1, 'local vote was not one authored history step')
    equal(h.store.get('poll').data.initialResults.currentUserVote, ['a'], 'local vote was not persisted')
    equal(h.engine.undo(), true, 'local vote undo failed')
    equal(h.percentages(), ['0%', '0%'], 'local vote undo did not reset counts')
    equal(h.selected(), [], 'local vote undo did not reset selection')
    equal(h.history.undoDepth, 0, 'local vote created multiple history entries')
    equal(h.engine.redo(), true, 'local vote redo failed')
    equal(h.percentages(), ['100%', '0%'], 'local vote redo did not restore counts')
    equal(h.errors, [], 'local vote failed')
  } finally { h.destroy() }
})

test('remote vote results stay live-only and survive subsequent author editing', async () => {
  const h = mount({ seed: result('1', 2, 8, []) })
  try {
    await h.resolveLoad(0, result('2', 7, 3, []))
    h.instance.element.querySelector('.oe-poll__option-marker').click()
    h.instance.element.querySelector('.oe-poll__submit').click()
    equal(h.votes.length, 1, 'vote was not submitted once')
    h.votes[0].resolve(result('3', 8, 3, ['a']))
    await tick()
    equal(h.history.undoDepth, 0, 'remote voting changed author history')
    h.update(data => ({ ...data, question: 'Updated after voting' }))
    equal(h.percentages(), ['73%', '27%'], 'author edit discarded remote vote result')
    equal(h.selected(), ['a'], 'author edit discarded acknowledged remote vote')
    equal(h.store.get('poll').data.initialResults.revision, '1', 'remote vote leaked into author seed')
  } finally { h.destroy() }
})

test('destroyed and superseded subscriptions cannot republish results', async () => {
  const h = mount()
  await h.resolveLoad(0, result('2'))
  h.destroy()
  h.destroy()
  equal(h.subscriptions[0].releases, 1, 'subscription was released multiple times')
  h.subscriptions[0].onUpdate(result('3', 1, 9, ['b']))
  equal(h.percentages(), ['70%', '30%'], 'destroyed subscription changed the retired DOM')
  equal(h.loads[0].signal.aborted, true, 'destroy did not abort result loading')
  equal(h.errors, [], 'stale subscription caused an error')
})

for (const field of ['question', 'option:a']) {
  test(`a retained native ${field} edit survives a read-only round trip`, async () => {
    const h = mount({ nativeInput: true })
    try {
      await h.resolveLoad(0, result('2'))
      const target = h.instance.editableFields().find(item => item.key === field).element
      target.textContent = 'Native text'
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'text' }))
      const canonical = h.store.get('poll').data
      equal(field === 'question' ? canonical.question : canonical.options[0].text,
        'Native text', 'native input did not reach the canonical model')
      h.setReadOnly(true)
      h.setReadOnly(false)
      const restored = h.instance.editableFields().find(item => item.key === field).element
      equal(restored.textContent, 'Native text', 'mode change replaced committed author text with stale plugin data')
    } finally { h.destroy() }
  })
}

test('a subscription uses the committed native option label without replacing its editing field', async () => {
  const h = mount({ nativeInput: true })
  try {
    await h.resolveLoad(0, result('2'))
    const target = h.instance.editableFields().find(item => item.key === 'option:a').element
    target.textContent = 'Native label'
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'label' }))
    h.subscriptions[0].onUpdate(result('3'))
    equal(h.instance.element.querySelector('.oe-poll__result-label').textContent,
      'Native label', 'subscription rendered a stale author label')
    equal(h.instance.editableFields().find(item => item.key === 'option:a').element === target,
      true, 'runtime-only update replaced the editing host')
  } finally { h.destroy() }
})


test('unsubmitted Poll choice survives unrelated author edits', async () => {
  const h = mount({ remote: false })
  try {
    h.instance.element.querySelector('.oe-poll__option-marker[data-option-id="b"]').click()
    equal(h.selected(), ['b'], 'pending choice was not selected')
    h.update(data => ({ ...data, question: 'Edited question' }))
    equal(h.selected(), ['b'], 'question update discarded the unsubmitted choice')
    h.update(data => ({ ...data, options: data.options.map(option => option.id === 'a'
      ? { ...option, text: 'Edited alternative' } : option) }))
    equal(h.selected(), ['b'], 'another option label update discarded the unsubmitted choice')
    equal(h.store.get('poll').data.initialResults, undefined, 'pending selection became persisted author data')
  } finally { h.destroy() }
})

test('unsubmitted multiple selection survives author editing then narrows to one on single choice', async () => {
  const h = mount({ remote: false })
  try {
    h.update(data => ({ ...data, type: 'multiple' }))
    h.instance.element.querySelector('.oe-poll__option-marker[data-option-id="a"]').click()
    h.instance.element.querySelector('.oe-poll__option-marker[data-option-id="b"]').click()
    equal(h.selected(), ['a', 'b'], 'two pending selections were not made')
    h.update(data => ({ ...data, question: 'Edited question' }))
    equal(h.selected(), ['a', 'b'], 'multiple selections disappeared after editing')
    h.update(data => ({ ...data, type: 'single' }))
    equal(h.selected(), ['a'], 'single-choice mode retained an illegal multi-selection')
    equal(h.history.undoDepth, 3, 'pending choices incorrectly added author history')
  } finally { h.destroy() }
})

test('removing a pending option or replacing the author seed invalidates the relevant selection', async () => {
  const h = mount({ remote: false, options: [
    { id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' },
  ] })
  try {
    h.instance.element.querySelector('.oe-poll__option-marker[data-option-id="b"]').click()
    h.update(data => ({ ...data, options: data.options.filter(option => option.id !== 'b') }))
    equal(h.selected(), [], 'removed pending option stayed selected')
    h.instance.element.querySelector('.oe-poll__option-marker[data-option-id="c"]').click()
    equal(h.selected(), ['c'], 'new pending selection was not made')
    h.update(data => ({ ...data, initialResults: {
      revision: '10', total: 2, options: [{ id: 'a', votes: 2 }, { id: 'c', votes: 0 }], currentUserVote: ['a'],
    } }))
    equal(h.selected(), ['a'], 'explicit seed replacement did not reset the pending selection')
    equal(h.percentages(), ['100%', '0%'], 'seed reset did not restore authored counts')
  } finally { h.destroy() }
})

test('a new remote Poll identity clears an unsubmitted choice', async () => {
  const h = mount()
  try {
    await h.resolveLoad(0, result('1', 2, 8, []))
    h.instance.element.querySelector('.oe-poll__option-marker[data-option-id="b"]').click()
    equal(h.selected(), ['b'], 'pending choice was not selected')
    h.update(data => ({ ...data, pollId: 'poll-2' }))
    equal(h.selected(), [], 'pending selection leaked across poll identities')
    await tick()
    equal(h.loads.at(-1).pollId, 'poll-2', 'new poll identity did not start loading')
  } finally { h.destroy() }
})


test('retired Poll option marker cannot update pending selection after an author repaint', async () => {
  const h = mount({ remote: false })
  try {
    const staleMarker = h.instance.element.querySelector('.oe-poll__option-marker[data-option-id="b"]')
    h.update(data => ({ ...data, question: 'Edited question' }))
    equal(staleMarker.isConnected, false, 'old option marker is still mounted')
    staleMarker.click()
    equal(h.selected(), [], 'retired option marker changed the current Poll selection')
    const live = h.instance.element.querySelector('.oe-poll__option-marker[data-option-id="b"]')
    live.click()
    equal(h.selected(), ['b'], 'the current Poll option lost its handler')
  } finally { h.destroy() }
})

test('retired Poll add-option action cannot write after a runtime-only refresh', async () => {
  const h = mount({ remote: false })
  try {
    const staleAdd = h.instance.element.querySelector('.oe-poll__option-add')
    const marker = h.instance.element.querySelector('.oe-poll__option-marker[data-option-id="b"]')
    marker.click()
    equal(marker.isConnected, true, 'runtime result update replaced the authoring host')
    equal(staleAdd.isConnected, false, 'runtime action button was not replaced')
    const before = h.store.get('poll').data
    staleAdd.click()
    equal(h.store.get('poll').data, before, 'retired runtime action inserted an option')
    const liveAdd = h.instance.element.querySelector('.oe-poll__option-add')
    liveAdd.click()
    equal(h.store.get('poll').data.options.length, 3, 'the current add-option action stopped working')
  } finally { h.destroy() }
})

const results = []
for (const entry of cases) {
  try { await entry.run(); results.push({ name: entry.name, pass: true }) }
  catch (error) { results.push({ name: entry.name, pass: false, error: String(error?.stack ?? error) }) }
}
await tick()
const report = { total: results.length, passed: results.filter(result => result.pass).length, results, errors: browserErrors }
document.querySelector('#result').textContent = JSON.stringify(report)
document.body.dataset.status = report.passed === report.total && browserErrors.length === 0 ? 'pass' : 'fail'
