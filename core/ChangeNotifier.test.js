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
