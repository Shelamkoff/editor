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
