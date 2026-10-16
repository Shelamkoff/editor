import assert from 'node:assert/strict'
import test from 'node:test'

import { ChangeNotifier } from './ChangeNotifier.js'

test('destroy suppresses an onChange callback whose save is already in flight', async () => {
  let resolveSave
  const save = new Promise(resolve => { resolveSave = resolve })
  let calls = 0
  const notifier = new ChangeNotifier(() => save, () => { calls++ }, 0)

  notifier.schedule()
  await new Promise(resolve => setTimeout(resolve, 5))
  notifier.destroy()
  resolveSave({ version: 'test', blocks: [] })
  await save
  await Promise.resolve()

  assert.equal(calls, 0)
})

test('a newer scheduled save suppresses an older result that settles later', async () => {
  const resolvers = []
  const seen = []
  const notifier = new ChangeNotifier(
    () => new Promise(resolve => { resolvers.push(resolve) }),
    data => seen.push(data.version),
    0,
  )

  notifier.schedule()
  await new Promise(resolve => setTimeout(resolve, 5))
  notifier.schedule()
  await new Promise(resolve => setTimeout(resolve, 5))

  assert.equal(resolvers.length, 2)
  resolvers[1]({ version: 'new', blocks: [] })
  await Promise.resolve()
  await Promise.resolve()
  resolvers[0]({ version: 'old', blocks: [] })
  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(seen, ['new'])
  notifier.destroy()
})


test('change debounce uses the supplied timer host instead of ambient timers', async () => {
  const callbacks = []
  const timerHost = {
    setTimeout(callback) { callbacks.push(callback); return 1 },
    clearTimeout() {},
  }
  const originalSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = () => { throw new Error('ambient setTimeout must not be used') }
  const seen = []
  const notifier = new ChangeNotifier(
    () => ({ version: 'owned', blocks: [] }),
    data => seen.push(data.version),
    0,
    timerHost,
  )
  try {
    notifier.schedule()
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
  assert.equal(callbacks.length, 1)
  await callbacks[0]()
  assert.deepEqual(seen, ['owned'])
  notifier.destroy()
})


test('change observer failures are routed through the configured error sink', async () => {
  const callbacks = []
  const timerHost = {
    setTimeout(callback) { callbacks.push(callback); return 1 },
    clearTimeout() {},
  }
  const errors = []
  const notifier = new ChangeNotifier(
    () => ({ version: 'test', blocks: [] }),
    async () => { throw new TypeError('observer failed') },
    0,
    timerHost,
    error => errors.push(error),
  )

  notifier.schedule()
  await callbacks[0]()
  await Promise.resolve()

  assert.equal(errors.length, 1)
  assert.equal(errors[0]?.name, 'TypeError')
  assert.equal(errors[0]?.message, 'observer failed')
  notifier.destroy()
})

test('async onChange rejection is contained by the notifier', async () => {
  const callbacks = []
  const timerHost = {
    setTimeout(callback) { callbacks.push(callback); return 1 },
    clearTimeout() {},
  }
  let warnings = 0
  const previousWarn = console.warn
  console.warn = () => { warnings++ }
  const notifier = new ChangeNotifier(
    () => ({ version: 'test', blocks: [] }),
    async () => { throw new Error('async callback failed') },
    0,
    timerHost,
  )

  try {
    notifier.schedule()
    await callbacks[0]()
    await Promise.resolve()
  } finally {
    notifier.destroy()
    console.warn = previousWarn
  }

  assert.equal(warnings, 1)
})

test('superseded and destroyed debounce callbacks cannot save or cancel the next timer lease', async () => {
  const callbacks = []
  const cleared = []
  const timerHost = {
    setTimeout(callback) { callbacks.push(callback); return callbacks.length },
    clearTimeout(handle) { cleared.push(handle) },
  }
  let saves = 0
  const notifier = new ChangeNotifier(
    () => { saves++; return { version: 'test', blocks: [] } },
    () => {},
    0,
    timerHost,
  )

  notifier.schedule()
  notifier.schedule()
  // Model a timer callback already queued when the host receives clearTimeout.
  await callbacks[0]()
  notifier.destroy()
  await callbacks[1]()

  assert.equal(saves, 0, 'neither retired callback can invoke the persistence source')
  assert.deepEqual(cleared, [1, 2], 'a stale callback must not erase the current timer handle')
})

test('rejected superseded save does not report stale errors after a newer change', async () => {
  const callbacks = []
  const outstanding = []
  const errors = []
  const versions = []
  const timerHost = {
    setTimeout(callback) { callbacks.push(callback); return callbacks.length },
    clearTimeout() {},
  }
  const notifier = new ChangeNotifier(
    () => new Promise((resolve, reject) => outstanding.push({ resolve, reject })),
    data => versions.push(data.version),
    0,
    timerHost,
    error => errors.push(error),
  )

  notifier.schedule()
  const older = callbacks[0]()
  notifier.schedule()
  const newer = callbacks[1]()
  outstanding[1].resolve({ version: 'new', blocks: [] })
  await newer
  outstanding[0].reject(new Error('retired save'))
  await older

  assert.deepEqual(versions, ['new'])
  assert.deepEqual(errors, [])
  notifier.destroy()
})

test('destroy suppresses late save and observer rejections but still reports active failures', async () => {
  const callbacks = []
  const errors = []
  const timerHost = {
    setTimeout(callback) { callbacks.push(callback); return callbacks.length },
    clearTimeout() {},
  }
  let rejectSave
  const savePromise = new Promise((_resolve, reject) => { rejectSave = reject })
  const notifier = new ChangeNotifier(
    () => savePromise,
    () => {},
    0,
    timerHost,
    error => errors.push(error),
  )

  notifier.schedule()
  const pending = callbacks[0]()
  notifier.destroy()
  rejectSave(new Error('retired save'))
  await pending
  assert.deepEqual(errors, [])

  let rejectObserver
  const observerPromise = new Promise((_resolve, reject) => { rejectObserver = reject })
  const observerNotifier = new ChangeNotifier(
    () => ({ version: 'test', blocks: [] }),
    () => observerPromise,
    0,
    timerHost,
    error => errors.push(error),
  )
  observerNotifier.schedule()
  const observing = callbacks[1]()
  // Let save settle and let onChange start before destruction.
  await Promise.resolve()
  observerNotifier.destroy()
  rejectObserver(new Error('retired observer'))
  await observing
  assert.deepEqual(errors, [])
})
