import assert from 'node:assert/strict'
import test from 'node:test'

import { claimPluginInstances } from './PluginOwnership.js'

test('plugin ownership disposes editor-scoped resources exactly once', () => {
  let calls = 0
  const plugin = { dispose() { calls++ } }
  const ownership = claimPluginInstances([plugin])

  ownership.destroy()
  ownership.destroy()

  assert.equal(calls, 1)
  assert.doesNotThrow(() => claimPluginInstances([plugin]).destroy())
})

test('one failing plugin does not prevent the remaining instances from being released', () => {
  const previousWarn = console.warn
  console.warn = () => {}
  try {
    const failed = { dispose() { throw new Error('expected') } }
    let disposed = false
    const healthy = { dispose() { disposed = true } }
    const ownership = claimPluginInstances([failed, healthy])

    ownership.destroy()

    assert.equal(disposed, true)
    assert.doesNotThrow(() => claimPluginInstances([failed, healthy]).destroy())
  } finally {
    console.warn = previousWarn
  }
})

test('ownership validation is atomic for duplicate and already-owned instances', () => {
  const duplicate = {}
  assert.throws(
    () => claimPluginInstances([duplicate, duplicate]),
    /cannot be shared/,
  )
  assert.doesNotThrow(() => claimPluginInstances([duplicate]).destroy())

  const available = {}
  const busy = {}
  const busyOwnership = claimPluginInstances([busy])
  try {
    assert.throws(
      () => claimPluginInstances([available, busy]),
      /cannot be shared/,
    )
    assert.doesNotThrow(() => claimPluginInstances([available]).destroy())
  } finally {
    busyOwnership.destroy()
  }
})
