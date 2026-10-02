import { createEditor } from '../../core/index.js'
import { createPollPlugin } from '../../plugins/index.js'
import { EditorRenderer } from '../../renderer/index.js'

const sandbox = document.querySelector('#sandbox')
const fixture = {
  pollId: 'poll-1',
  question: 'Choose one',
  type: 'single',
  options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }],
  resultsMode: 'always',
}

function assert(value, message) {
  if (!value) throw new Error(message)
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function makePoll(config = {}, data = fixture, options = {}) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const definition = createPollPlugin({ ...config, injectStyles: false })
  const editor = createEditor({
    holder,
    plugins: [definition],
    defaultBlock: 'poll',
    injectStyles: false,
    readOnly: options.readOnly === true,
    changeDebounceMs: 0,
    data: { version: '2.0.0', blocks: [{ id: options.id ?? 'poll', type: 'poll', data: structuredClone(data) }] },
  })
  const root = holder.querySelector('.oe-poll')
  assert(root instanceof HTMLElement, 'Poll editor projection is missing')
  return { holder, editor, root }
}

function marker(holder, id) {
  const value = holder.querySelector(`.oe-poll__option-marker[data-option-id="${id}"]`)
  assert(value instanceof HTMLButtonElement, `Poll marker ${id} is missing`)
  return value
}

function submit(holder) {
  const value = holder.querySelector('.oe-poll__submit')
  assert(value instanceof HTMLButtonElement, 'Poll submit button is missing')
  return value
}

async function run() {
  const local = makePoll({}, { ...fixture, resultsMode: 'afterVote', pollId: undefined }, { id: 'local' })
  let localTransactions = 0
  local.editor.on('transaction:committed', () => { localTransactions++ })

  marker(local.holder, 'yes').click()
  assert(!local.holder.querySelector('.oe-poll__result-bar'), 'afterVote exposed results before confirmation')
  assert(!submit(local.holder).disabled, 'selected local vote did not enable submit')
  assert(localTransactions === 0, 'transient Poll selection entered canonical history')

  submit(local.holder).click()
  await tick()
  const localSaved = local.editor.save().blocks[0].data
  assert(localTransactions === 1, `local vote created ${localTransactions} transactions instead of one`)
  assert(localSaved.initialResults?.currentUserVote?.[0] === 'yes', 'local vote was not serialized')
  assert(localSaved.initialResults?.options?.find(option => option.id === 'yes')?.votes === 1, 'local vote count is wrong')
  assert(local.holder.querySelector('.oe-poll__result-bar'), 'afterVote did not reveal results after local confirmation')

  assert(local.editor.undo(), 'local vote undo was unavailable')
  assert(local.editor.save().blocks[0].data.initialResults === undefined, 'undo kept local vote snapshot')
  assert(!local.holder.querySelector('.oe-poll__result-bar'), 'undo kept afterVote results visible')
  assert(local.editor.redo(), 'local vote redo was unavailable')
  assert(local.editor.save().blocks[0].data.initialResults?.currentUserVote?.[0] === 'yes', 'redo did not restore local vote')
  local.editor.destroy()
  local.holder.remove()

  const manyVoters = Array.from({ length: 60 }, (_, index) => ({ id: `voter-${index + 1}`, name: `Voter ${index + 1}` }))
  const initialResults = {
    total: 0,
    options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }],
    votersTotal: manyVoters.length,
    voters: manyVoters,
  }
  const retained = makePoll({ maxVoters: 75 }, { ...fixture, initialResults }, { id: 'retained' })
  assert(retained.holder.querySelectorAll('.oe-poll__voters li').length === 60, 'Poll truncated voters below configured maxVoters')
  retained.editor.destroy()
  retained.holder.remove()

  const retainedRenderer = new EditorRenderer({
    blockTypes: ['poll'],
    blockConfigs: { poll: { maxVoters: 75 } },
    injectStyles: false,
  })
  const retainedContainer = document.createElement('div')
  sandbox.appendChild(retainedContainer)
  retainedRenderer.renderTo({
    version: '2.0.0',
    blocks: [{ id: 'retained-renderer', type: 'poll', data: { ...fixture, initialResults } }],
  }, retainedContainer)
  assert(retainedContainer.querySelectorAll('.editor-poll__voters li').length === 60, 'Poll renderer truncated voters below configured maxVoters')
  retainedRenderer.destroy(retainedContainer)
  retainedRenderer.destroy()
  retainedContainer.remove()

  let voteCalls = 0
  let unsubscribeCalls = 0
  let loadSignal
  let subscriber
  let resolveVote
  const dataSource = {
    async load({ signal }) {
      loadSignal = signal
      return { revision: '1', total: 1, options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 0 }] }
    },
    vote({ optionIds, signal }) {
      voteCalls++
      assert(optionIds.join(',') === 'no', 'server vote received wrong selection')
      assert(!signal.aborted, 'server vote started with an aborted signal')
      return new Promise(resolve => { resolveVote = resolve })
    },
    subscribe(context) {
      subscriber = context
      return () => { unsubscribeCalls++ }
    },
  }
  const compareRevisions = (next, current) => Number(next) - Number(current)
  const remote = makePoll(
    { dataSource, compareRevisions },
    { ...fixture, resultsMode: 'afterVote' },
    { id: 'remote' },
  )
  let remoteTransactions = 0
  remote.editor.on('transaction:committed', () => { remoteTransactions++ })
  await tick()
  await tick()

  marker(remote.holder, 'no').click()
  submit(remote.holder).click()
  assert(voteCalls === 1, 'remote vote did not start exactly once')
  assert(submit(remote.holder).disabled, 'pending remote vote did not disable submit')

  subscriber.onUpdate({
    revision: '2',
    total: 2,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }],
    votersTotal: 1,
    voters: [{ id: 'u1', name: '<b>Ada</b>', avatar: 'javascript:alert(1)', optionIds: ['no'] }],
  })
  assert(submit(remote.holder).disabled, 'subscription update re-enabled submit while vote was pending')
  submit(remote.holder).click()
  assert(voteCalls === 1, 'pending remote vote accepted duplicate submit')

  resolveVote({
    revision: '2',
    total: 2,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }],
    currentUserVote: ['no'],
  })
  await tick()
  await tick()
  assert(remote.holder.querySelector('.oe-poll__result-bar'), 'confirmed remote vote did not reveal afterVote results')
  assert(remote.holder.textContent.includes('<b>Ada</b>'), 'voter name was not preserved as literal text')
  assert(!remote.holder.querySelector('.oe-poll__voters img'), 'unsafe voter avatar was retained')

  subscriber.onUpdate({
    revision: '3',
    total: 3,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 2 }],
    currentUserVote: ['no'],
  })
  const currentPercentages = [...remote.holder.querySelectorAll('.oe-poll__pct')].map(element => element.textContent).join(',')
  subscriber.onUpdate({
    revision: '2',
    total: 100,
    options: [{ id: 'yes', votes: 100 }, { id: 'no', votes: 0 }],
    currentUserVote: ['no'],
  })
  assert([...remote.holder.querySelectorAll('.oe-poll__pct')].map(element => element.textContent).join(',') === currentPercentages, 'stale Poll revision replaced newer results')
  assert(remote.editor.save().blocks[0].data.initialResults === undefined, 'remote runtime leaked into canonical Poll data')
  assert(remoteTransactions === 0, 'remote runtime results entered editor history')

  remote.editor.destroy()
  remote.holder.remove()
  assert(loadSignal?.aborted, 'destroy did not abort Poll data source')
  assert(unsubscribeCalls === 1, `Poll data source unsubscribed ${unsubscribeCalls} times`)

  let readOnlyVoteCalls = 0
  let readOnlySubscriber
  const readOnly = makePoll({
    dataSource: {
      async load() {
        return { revision: '1', total: 0, options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }] }
      },
      async vote() {
        readOnlyVoteCalls++
        return { revision: '2', total: 1, options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 0 }] }
      },
      subscribe(context) { readOnlySubscriber = context },
    },
  }, fixture, { readOnly: true, id: 'readonly' })
  await tick()
  readOnlySubscriber?.onUpdate({
    revision: '2',
    total: 1,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 0 }],
  })
  assert(marker(readOnly.holder, 'yes').disabled, 'read-only Poll enabled option selection')
  assert(submit(readOnly.holder).disabled, 'read-only Poll enabled submit')
  marker(readOnly.holder, 'yes').dispatchEvent(new MouseEvent('click', { bubbles: true }))
  submit(readOnly.holder).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  assert(readOnlyVoteCalls === 0, 'read-only Poll invoked external vote callback')
  readOnly.editor.destroy()
  readOnly.holder.remove()

  let deferredLoads = 0
  let deferredUnsubscribes = 0
  const lifetime = makePoll({
    dataSource: {
      async load() {
        deferredLoads++
        return { total: 0, options: [] }
      },
      async vote() { throw new Error('destroyed Poll cannot submit') },
      subscribe() { return () => { deferredUnsubscribes++ } },
    },
  }, fixture, { id: 'lifetime' })
  const retainedMarker = marker(lifetime.holder, 'yes')
  const retainedSubmit = submit(lifetime.holder)
  lifetime.editor.destroy()
  lifetime.holder.remove()
  retainedMarker.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  retainedSubmit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await tick()
  assert(deferredLoads === 0, 'deferred Poll load started after destroy')
  assert(deferredUnsubscribes === 1, 'Poll subscription was not disposed exactly once')

  let cleanupObserverCalls = 0
  let cleanupUnhandled = 0
  const onUnhandled = () => { cleanupUnhandled++ }
  window.addEventListener('unhandledrejection', onUnhandled)
  const cleanup = makePoll({
    dataSource: {
      async load() { return { revision: '1', total: 0, options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }] } },
      async vote() { return { revision: '2', total: 0, options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }] } },
      subscribe() { return () => { throw new Error('cleanup failed') } },
    },
    async onError() {
      cleanupObserverCalls++
      throw new Error('observer failed')
    },
  }, fixture, { id: 'cleanup' })
  await tick()
  cleanup.editor.destroy()
  cleanup.holder.remove()
  await tick()
  await tick()
  window.removeEventListener('unhandledrejection', onUnhandled)
  assert(cleanupObserverCalls === 1, 'Poll cleanup error did not reach onError')
  assert(cleanupUnhandled === 0, 'async Poll error observer leaked an unhandled rejection')

  const rendererSource = {
    async load() { return { revision: '1', total: 1, options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 0 }] } },
    async vote({ optionIds }) {
      assert(optionIds.join(',') === 'no', 'renderer vote received wrong selection')
      return { revision: '2', total: 2, options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }], currentUserVote: ['no'] }
    },
  }
  const renderer = new EditorRenderer({
    blockTypes: ['poll'],
    blockConfigs: { poll: { dataSource: rendererSource, compareRevisions } },
    injectStyles: false,
  })
  const container = document.createElement('div')
  sandbox.appendChild(container)
  renderer.renderTo({ version: '2.0.0', blocks: [{ id: 'poll-renderer', type: 'poll', data: fixture }] }, container)
  await tick()
  const rendererMarkers = container.querySelectorAll('.editor-poll__marker')
  assert(rendererMarkers.length === 2, 'renderer Poll controls are missing')
  rendererMarkers[1].click()
  const rendererSubmit = container.querySelector('.editor-poll__submit')
  assert(rendererSubmit instanceof HTMLButtonElement, 'renderer Poll submit is missing')
  rendererSubmit.click()
  await tick()
  assert(container.querySelector('.editor-poll__bar'), 'renderer Poll did not apply vote results')
  renderer.destroy(container)
  renderer.destroy()
  container.remove()

  sandbox.replaceChildren()
  return {
    modes: ['local', 'remote', 'read-only', 'renderer'],
    history: ['single local transaction', 'undo', 'redo', 'remote runtime excluded'],
    guards: ['afterVote confirmation', 'duplicate submit', 'revision ordering', 'abort', 'unsubscribe', 'safe voters', 'async observer containment'],
  }
}

try {
  const summary = await run()
  document.querySelector('#result').textContent = JSON.stringify(summary)
  document.body.dataset.status = 'pass'
} catch (error) {
  document.querySelector('#result').textContent = error?.stack || String(error)
  document.body.dataset.status = 'fail'
}
