import assert from 'node:assert/strict'
import test from 'node:test'
import { EventBus } from '@shelamkoff/event-bus'
import { EditorEventSubscriptions } from './PublicEditorApi.js'
import { EditorEvent } from './editorEvents.js'

for (const kind of ['on', 'once']) {
  test(`public ${kind} observes the original thenable exactly once`, async () => {
    const events = new EventBus()
    const subscriptions = new EditorEventSubscriptions(events)
    let reads = 0
    let calls = 0
    let receiver
    const failure = new Error('original observer failure')
    const reports = []
    const previousError = console.error
    console.error = (...args) => { reports.push(args) }
    const result = {
      get then() {
        reads++
        if (reads > 1) return resolve => resolve()
        return function (_resolve, reject) {
          calls++
          receiver = this
          reject(failure)
        }
      },
    }
    const unsubscribe = subscriptions[kind](EditorEvent.CHANGED, () => result)
    try {
      events.emit(EditorEvent.CHANGED)
      assert.equal(calls, 0, 'thenable adoption remains asynchronous')
      for (let index = 0; index < 4; index++) await Promise.resolve()
      assert.equal(reads, 1)
      assert.equal(calls, 1)
      assert.strictEqual(receiver, result)
      assert.deepEqual(reports, [['[EditorEvents] editor:changed:', failure]])
      unsubscribe()
      events.emit(EditorEvent.CHANGED)
      assert.equal(reads, 1, 'unsubscribed observers stay inactive')
    } finally {
      unsubscribe()
      console.error = previousError
    }
  })
}

test('public once detaches before synchronous reentry and contains async rejection', async () => {
  const events = new EventBus()
  const subscriptions = new EditorEventSubscriptions(events)
  let calls = 0
  const reports = []
  const previousError = console.error
  console.error = (...args) => { reports.push(args) }
  try {
    subscriptions.once(EditorEvent.CHANGED, async () => {
      calls++
      events.emit(EditorEvent.CHANGED)
      throw new Error('one failure')
    })
    events.emit(EditorEvent.CHANGED)
    for (let index = 0; index < 4; index++) await Promise.resolve()
    assert.equal(calls, 1)
    assert.equal(reports.length, 1)
    assert.equal(reports[0][1].message, 'one failure')
  } finally {
    console.error = previousError
  }
})
