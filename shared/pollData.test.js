import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyLocalPollVote,
  normalizePollData,
  normalizePollResults,
  shouldAcceptPollRevision,
  validatePollData,
} from './pollData.js'

test('poll normalization creates stable unique option identities and migrates legacy votes', () => {
  let next = 0
  const data = normalizePollData({
    question: 'Choose',
    type: 'single',
    options: [{ text: 'A', votes: 2 }, { id: 'b', text: 'B', votes: 1 }],
  }, () => `generated-${++next}`)

  assert.deepEqual(data.options, [
    { id: 'generated-1', text: 'A' },
    { id: 'b', text: 'B' },
  ])
  assert.deepEqual(data.initialResults, {
    total: 3,
    options: [{ id: 'generated-1', votes: 2 }, { id: 'b', votes: 1 }],
  })
  assert.equal(validatePollData(data), true)
})

test('poll schema rejects duplicate options, incomplete choices and mismatched results', () => {
  const base = {
    question: 'Choose',
    type: 'multiple',
    resultsMode: 'afterVote',
    options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
  }
  assert.equal(validatePollData(base), true)
  assert.equal(validatePollData({ ...base, options: [{ id: 'a', text: 'A' }, { id: 'a', text: 'B' }] }), false)
  assert.equal(validatePollData({ ...base, options: [{ id: 'a', text: '' }, { id: 'b', text: 'B' }] }), false)
  assert.equal(validatePollData({
    ...base,
    initialResults: { total: 1, options: [{ id: 'a', votes: 1 }] },
  }), false)
})

test('runtime results discard unknown options and unsafe voter avatars', () => {
  const result = normalizePollResults({
    revision: '2',
    total: 9,
    options: [{ id: 'a', votes: 2 }, { id: 'unknown', votes: 7 }],
    currentUserVote: ['a', 'unknown'],
    votersTotal: 100,
    voters: [{ id: 'u1', name: '<b>User</b>', avatar: 'javascript:alert(1)', optionIds: ['a', 'unknown'] }],
  }, ['a', 'b'])

  assert.deepEqual(result.options, [{ id: 'a', votes: 2 }, { id: 'b', votes: 0 }])
  assert.deepEqual(result.currentUserVote, ['a'])
  assert.deepEqual(result.voters, [{ id: 'u1', name: '<b>User</b>', optionIds: ['a'] }])
  assert.equal(result.votersTotal, 100)
})

test('local voting replaces the previous user vote without double-counting', () => {
  const first = applyLocalPollVote(undefined, [], ['a'], ['a', 'b'])
  assert.deepEqual(first.options, [{ id: 'a', votes: 1 }, { id: 'b', votes: 0 }])
  const changed = applyLocalPollVote(first, ['a'], ['b'], ['a', 'b'])
  assert.deepEqual(changed.options, [{ id: 'a', votes: 0 }, { id: 'b', votes: 1 }])
  assert.deepEqual(changed.currentUserVote, ['b'])
})

test('poll revisions use host ordering only when it is explicitly provided', () => {
  assert.equal(shouldAcceptPollRevision('2', '1'), true)
  assert.equal(shouldAcceptPollRevision('1', '1'), false)
  const numeric = (next, current) => Number(next) - Number(current)
  assert.equal(shouldAcceptPollRevision('4', '5', numeric), false)
  assert.equal(shouldAcceptPollRevision('6', '5', numeric), true)
})
