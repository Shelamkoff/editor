// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { PopupManager } from './PopupManager.js'

function managerWithRejectedPopup() {
  // A rejected request still owns (and must dispose) the supplied content.
  const manager = new PopupManager({ on: () => () => {} }, 'changed', {}, {}, () => true)
  return manager
}

test('popup cleanup observes and contains an asynchronous rejection', async () => {
  const manager = managerWithRejectedPopup()
  const error = new Error('async cleanup failed')
  const reports = []
  const previous = console.error
  console.error = (...args) => reports.push(args)
  try {
    manager.showPopup({}, {}, async () => { throw error })
    for (let i = 0; i < 4; i++) await Promise.resolve()
    assert.equal(reports.length, 1)
    assert.strictEqual(reports[0][1], error)
  } finally { console.error = previous; manager.destroy() }
})

test('popup cleanup consumes a returned thenable exactly once', async () => {
  const manager = managerWithRejectedPopup()
  let thenCalls = 0
  manager.showPopup({}, {}, () => ({ then(resolve) { thenCalls++; resolve() } }))
  for (let i = 0; i < 4; i++) await Promise.resolve()
  assert.equal(thenCalls, 1)
  manager.destroy()
})

test('popup cleanup keeps synchronous throwing disposers isolated', () => {
  const manager = managerWithRejectedPopup()
  const reports = []
  const previous = console.error
  console.error = (...args) => reports.push(args)
  try {
    assert.doesNotThrow(() => manager.showPopup({}, {}, () => { throw new Error('sync failure') }))
    assert.equal(reports.length, 1)
  } finally { console.error = previous; manager.destroy() }
})
