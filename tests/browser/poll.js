import { verifyPollLifetime } from './poll-lifetime.js'
import { createEditor } from '../../core/index.js'
import { createPollPlugin } from '../../plugins/poll/index.js'
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

function createPollEditor(config = {}, data = fixture, { readOnly = false } = {}) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [createPollPlugin({ ...config, injectStyles: false })],
    defaultBlock: 'poll',
    injectStyles: false,
    readOnly,
    changeDebounceMs: 0,
    data: { version: '2.0.0', blocks: [{ id: 'poll', type: 'poll', data: structuredClone(data) }] },
  })
  const element = holder.querySelector('.oe-poll')
  assert(element instanceof HTMLElement, 'poll editor did not project its block')
  return { holder, editor, element }
}

function option(root, id) {
  const button = root.querySelector(`[data-option-id="${id}"].oe-poll__option-marker, [data-option-id="${id}"] .oe-poll__option-marker`)
  assert(button instanceof HTMLButtonElement, `missing poll option ${id}`)
  return button
}

function submit(root) {
  const button = root.querySelector('.oe-poll__submit')
  assert(button instanceof HTMLButtonElement, 'missing poll submit button')
  return button
}

async function run() {
  const afterVote = createPollEditor({}, { ...fixture, resultsMode: 'afterVote' })
  option(afterVote.element, 'yes').click()
  assert(!afterVote.element.querySelector('.oe-poll__result-bar'), 'afterVote exposed results before vote confirmation')
  submit(afterVote.element).click()
  await tick()
  assert(afterVote.element.querySelector('.oe-poll__result-bar'), 'afterVote did not expose results after confirmed local vote')
  afterVote.editor.destroy()
  afterVote.holder.remove()

  const local = createPollEditor()
  let localCommits = 0
  const offLocal = local.editor.on('transaction:committed', () => { localCommits++ })
  option(local.element, 'yes').click()
  assert(localCommits === 0, 'selecting a poll option mutated canonical history before confirmation')
  submit(local.element).click()
  await tick()
  const localSaved = local.editor.save().blocks[0].data
  assert(localCommits === 1, 'one local vote must create exactly one canonical history transaction')
  assert(localSaved.initialResults.currentUserVote[0] === 'yes', 'local vote was not serialized')
  assert(localSaved.initialResults.options.find(item => item.id === 'yes').votes === 1, 'local vote count is wrong')
  offLocal?.()
  local.editor.destroy()
  local.holder.remove()

  const manyVoters = Array.from({ length: 60 }, (_, index) => ({ id: `voter-${index + 1}`, name: `Voter ${index + 1}` }))
  const initialResults = {
    total: 0,
    options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }],
    votersTotal: manyVoters.length,
    voters: manyVoters,
  }
  const retained = createPollEditor({ maxVoters: 75 }, { ...fixture, initialResults })
  assert(retained.element.querySelectorAll('.oe-poll__voters li').length === 60, 'poll truncated initial voters below configured maxVoters')
  retained.editor.destroy()
  retained.holder.remove()

  const retainedRenderer = new EditorRenderer({
    blockTypes: ['poll'],
    blockConfigs: { poll: { maxVoters: 75 } },
  })
  const retainedContainer = document.createElement('div')
  sandbox.appendChild(retainedContainer)
  retainedRenderer.renderTo({ version: '2.0.0', blocks: [{ id: 'retained-poll', type: 'poll', data: { ...fixture, initialResults } }] }, retainedContainer)
  assert(retainedContainer.querySelectorAll('.editor-poll__voters li').length === 60, 'poll renderer truncated voters below configured maxVoters')
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
      assert(!signal.aborted, 'server vote started with aborted signal')
      return new Promise(resolve => { resolveVote = resolve })
    },
    subscribe(context) {
      subscriber = context
      return () => { unsubscribeCalls++ }
    },
  }
  const compareRevisions = (next, current) => Number(next) - Number(current)
  const remote = createPollEditor({ dataSource, compareRevisions }, { ...fixture, resultsMode: 'afterVote' })
  let remoteCommits = 0
  const offRemote = remote.editor.on('transaction:committed', () => { remoteCommits++ })
  await tick()
  option(remote.element, 'no').click()
  submit(remote.element).click()
  subscriber.onUpdate({
    revision: '2', total: 2,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }],
    votersTotal: 1,
    voters: [{ id: 'u1', name: '<b>Ada</b>', avatar: 'javascript:alert(1)', optionIds: ['no'] }],
  })
  assert(submit(remote.element).disabled, 'subscription update re-enabled submit while vote was pending')
  submit(remote.element).click()
  assert(voteCalls === 1, 'poll accepted a duplicate remote vote')
  resolveVote({
    revision: '2', total: 2,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }],
    currentUserVote: ['no'],
  })
  await tick()
  assert(remote.element.querySelector('.oe-poll__result-bar'), 'equal-revision confirmed vote did not reveal afterVote results')
  assert(remote.element.textContent.includes('<b>Ada</b>'), 'voter name must be displayed as text')
  assert(!remote.element.querySelector('.oe-poll__voters img'), 'unsafe voter avatar was retained')

  subscriber.onUpdate({
    revision: '3', total: 3,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 2 }],
    currentUserVote: ['no'],
  })
  const currentPercentages = [...remote.element.querySelectorAll('.oe-poll__pct')].map(element => element.textContent).join(',')
  subscriber.onUpdate({
    revision: '2', total: 100,
    options: [{ id: 'yes', votes: 100 }, { id: 'no', votes: 0 }],
    currentUserVote: ['no'],
  })
  assert([...remote.element.querySelectorAll('.oe-poll__pct')].map(element => element.textContent).join(',') === currentPercentages, 'stale poll revision replaced newer results')
  assert(remote.editor.save().blocks[0].data.initialResults === undefined, 'remote runtime leaked into canonical document data')
  assert(remoteCommits === 0, 'remote results entered canonical editor history')
  offRemote?.()
  remote.editor.destroy()
  assert(loadSignal.aborted, 'destroy did not abort Poll data source')
  assert(unsubscribeCalls === 1, 'destroy did not unsubscribe Poll data source')
  remote.holder.remove()

  let readOnlyVoteCalls = 0
  let readOnlySubscriber
  const readOnlySource = {
    async load() {
      return { revision: '1', total: 0, options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }] }
    },
    async vote() {
      readOnlyVoteCalls++
      return { revision: '2', total: 1, options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 0 }] }
    },
    subscribe(context) { readOnlySubscriber = context },
  }
  const readOnly = createPollEditor({ dataSource: readOnlySource }, fixture, { readOnly: true })
  await tick()
  readOnlySubscriber.onUpdate({
    revision: '2', total: 1,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 0 }],
  })
  assert(option(readOnly.element, 'yes').disabled, 'read-only editor enabled poll option selection')
  assert(submit(readOnly.element).disabled, 'read-only editor enabled poll submission')
  option(readOnly.element, 'yes').dispatchEvent(new MouseEvent('click', { bubbles: true }))
  submit(readOnly.element).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  assert(readOnlyVoteCalls === 0, 'read-only poll invoked external vote callback')
  readOnly.editor.destroy()
  readOnly.holder.remove()

  const renderer = new EditorRenderer({
    blockTypes: ['poll'],
    blockConfigs: { poll: { dataSource, compareRevisions } },
  })
  const container = document.createElement('div')
  sandbox.appendChild(container)
  renderer.renderTo({ version: '2.0.0', blocks: [{ id: 'poll', type: 'poll', data: fixture }] }, container)
  await tick()
  assert(container.querySelector('.editor-poll__submit'), 'renderer did not create interactive poll controls')
  container.querySelectorAll('.editor-poll__marker')[1].click()
  container.querySelector('.editor-poll__submit').click()
  subscriber.onUpdate({
    revision: '2', total: 2,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }],
  })
  assert(container.querySelector('.editor-poll__submit').disabled, 'renderer subscription update re-enabled pending vote')
  container.querySelector('.editor-poll__submit').click()
  assert(voteCalls === 2, 'renderer accepted a duplicate vote after subscription update')
  resolveVote({
    revision: '2', total: 2,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }],
    currentUserVote: ['no'],
  })
  await tick()
  renderer.destroy(container)
  renderer.destroy()
  container.remove()

  let cleanupObserverCalls = 0
  let cleanupUnhandledRejections = 0
  const onUnhandledCleanup = () => { cleanupUnhandledRejections++ }
  window.addEventListener('unhandledrejection', onUnhandledCleanup)
  const cleanupRenderer = new EditorRenderer({
    blockTypes: ['poll'],
    blockConfigs: {
      poll: {
        dataSource: {
          async load() {
            return { revision: '1', total: 0, options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }] }
          },
          async vote() {
            return { revision: '2', total: 0, options: [{ id: 'yes', votes: 0 }, { id: 'no', votes: 0 }] }
          },
          subscribe() {
            return () => { throw new Error('cleanup failed') }
          },
        },
        async onError() {
          cleanupObserverCalls++
          throw new Error('observer failed')
        },
      },
    },
  })
  const cleanupContainer = document.createElement('div')
  sandbox.appendChild(cleanupContainer)
  cleanupRenderer.renderTo({ version: '2.0.0', blocks: [{ id: 'cleanup-poll', type: 'poll', data: fixture }] }, cleanupContainer)
  await tick()
  assert(cleanupObserverCalls === 0, 'cleanup observer fired before cleanup')
  cleanupRenderer.destroy(cleanupContainer)
  await tick()
  window.removeEventListener('unhandledrejection', onUnhandledCleanup)
  assert(cleanupObserverCalls === 1, 'renderer cleanup error did not reach onError observer')
  assert(cleanupUnhandledRejections === 0, 'async Poll cleanup observer leaked an unhandled rejection')
  cleanupRenderer.destroy()
  cleanupContainer.remove()

  await verifyPollLifetime(fixture, sandbox)

  return {
    lifetimeCases: ['destroy before load', 'retained controls', 'reentrant unsubscribe'],
    modes: ['local editor', 'remote editor', 'read-only editor', 'renderer'],
    guards: ['afterVote confirmation', 'single canonical transaction', 'configured voter retention', 'duplicate submit', 'revision ordering', 'read-only side effects', 'abort', 'unsubscribe', 'safe voters'],
  }
}

try {
  const result = await run()
  document.querySelector('#result').textContent = JSON.stringify(result)
  document.body.dataset.status = 'pass'
} catch (error) {
  document.querySelector('#result').textContent = error?.stack || String(error)
  document.body.dataset.status = 'fail'
}
