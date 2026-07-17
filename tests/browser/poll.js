import { Poll } from '../../plugins/poll/index.js'
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

async function run() {
  let mutations = 0
  const afterVote = new Poll()
  const afterVoteElement = afterVote.render({ ...fixture, resultsMode: 'afterVote' }, { mutate(operation) { mutations++; return operation() } })
  sandbox.appendChild(afterVoteElement)
  afterVoteElement.querySelector('[data-option-id="yes"]').click()
  assert(!afterVoteElement.querySelector('.oe-poll__result-bar'), 'afterVote exposed results before a vote was confirmed')
  afterVoteElement.querySelector('.oe-poll__submit').click()
  assert(afterVoteElement.querySelector('.oe-poll__result-bar'), 'afterVote did not expose results after a confirmed local vote')
  afterVote.destroy(afterVoteElement)
  afterVoteElement.remove()

  const local = new Poll()
  const localElement = local.render(fixture, { mutate(operation) { mutations++; return operation() } })
  sandbox.appendChild(localElement)
  localElement.querySelector('[data-option-id="yes"]').click()
  localElement.querySelector('.oe-poll__submit').click()
  const localSaved = local.save(localElement)
  assert(mutations === 2, 'each local vote must create exactly one history mutation')
  assert(localSaved.initialResults.currentUserVote[0] === 'yes', 'local vote was not serialized')
  assert(localSaved.initialResults.options.find(option => option.id === 'yes').votes === 1, 'local vote count is wrong')
  local.destroy(localElement)
  localElement.remove()

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
  const remote = new Poll({ dataSource, compareRevisions })
  const remoteElement = remote.render({ ...fixture, resultsMode: 'afterVote' }, { mutate(operation) { mutations++; return operation() } })
  sandbox.appendChild(remoteElement)
  await tick()
  remoteElement.querySelector('[data-option-id="no"]').click()
  remoteElement.querySelector('.oe-poll__submit').click()
  subscriber.onUpdate({
    revision: '2', total: 2,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }],
    votersTotal: 1,
    voters: [{ id: 'u1', name: '<b>Ada</b>', avatar: 'javascript:alert(1)', optionIds: ['no'] }],
  })
  assert(remoteElement.querySelector('.oe-poll__submit').disabled, 'subscription update re-enabled submit while a vote was pending')
  remoteElement.querySelector('.oe-poll__submit').click()
  assert(voteCalls === 1, 'submitting poll accepted a duplicate vote')
  resolveVote({
    revision: '2', total: 2,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }],
    currentUserVote: ['no'],
  })
  await tick()
  assert(remoteElement.querySelector('.oe-poll__result-bar'), 'confirmed vote with an equal revision did not reveal afterVote results')
  assert(remoteElement.textContent.includes('<b>Ada</b>'), 'voter name must be displayed as text')
  assert(!remoteElement.querySelector('.oe-poll__voters img'), 'unsafe voter avatar was retained')
  subscriber.onUpdate({
    revision: '3', total: 3,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 2 }],
    currentUserVote: ['no'],
  })
  const currentPercentages = [...remoteElement.querySelectorAll('.oe-poll__pct')].map(element => element.textContent).join(',')
  subscriber.onUpdate({
    revision: '2', total: 100,
    options: [{ id: 'yes', votes: 100 }, { id: 'no', votes: 0 }],
    currentUserVote: ['no'],
  })
  assert([...remoteElement.querySelectorAll('.oe-poll__pct')].map(element => element.textContent).join(',') === currentPercentages, 'stale poll revision replaced newer results')
  assert(remote.save(remoteElement).initialResults === undefined, 'remote runtime leaked into document data')
  assert(mutations === 2, 'remote results entered editor history')
  remote.destroy(remoteElement)
  assert(loadSignal.aborted, 'destroy did not abort Poll data source')
  assert(unsubscribeCalls === 1, 'destroy did not unsubscribe Poll data source')
  remoteElement.remove()

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
    subscribe(context) {
      readOnlySubscriber = context
    },
  }
  const readOnlyPoll = new Poll({ dataSource: readOnlySource })
  const readOnlyElement = readOnlyPoll.render(fixture, {
    readOnly: true,
    mutate() { throw new Error('read-only poll attempted a document mutation') },
  })
  sandbox.appendChild(readOnlyElement)
  await tick()
  readOnlySubscriber.onUpdate({
    revision: '2', total: 1,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 0 }],
  })
  const readOnlySubmit = readOnlyElement.querySelector('.oe-poll__submit')
  assert(readOnlySubmit.disabled, 'asynchronous results enabled voting in read-only mode')
  readOnlySubmit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  assert(readOnlyVoteCalls === 0, 'read-only poll invoked the external vote callback')
  readOnlyPoll.destroy(readOnlyElement)
  readOnlyElement.remove()

  const renderer = new EditorRenderer({
    blockTypes: ['poll'],
    blockConfigs: { poll: { dataSource, compareRevisions } },
  })
  const container = document.createElement('div')
  sandbox.appendChild(container)
  renderer.renderTo({ blocks: [{ id: 'poll', type: 'poll', data: fixture }] }, container)
  await tick()
  assert(container.querySelector('.editor-poll__submit'), 'renderer did not create interactive poll controls')
  container.querySelectorAll('.editor-poll__marker')[1].click()
  container.querySelector('.editor-poll__submit').click()
  subscriber.onUpdate({
    revision: '2', total: 2,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }],
  })
  assert(container.querySelector('.editor-poll__submit').disabled, 'renderer subscription update re-enabled a pending vote')
  container.querySelector('.editor-poll__submit').click()
  assert(voteCalls === 2, 'renderer accepted a duplicate vote after a subscription update')
  resolveVote({
    revision: '2', total: 2,
    options: [{ id: 'yes', votes: 1 }, { id: 'no', votes: 1 }],
    currentUserVote: ['no'],
  })
  await tick()
  renderer.destroy(container)

  return {
    modes: ['local', 'load', 'vote', 'subscribe', 'renderer'],
    guards: ['afterVote confirmation', 'single history step', 'duplicate submit', 'concurrent subscription update', 'revision ordering', 'read-only side effects', 'abort', 'unsubscribe', 'safe voters'],
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
