import test from 'node:test'
import assert from 'node:assert/strict'

import { InlineToolMounts } from './InlineToolMounts.js'

const runtime = { prepareExtensionValue: operation => operation() }
function tool(type, callbacks = {}) {
  return {
    type, icon: '<i></i>', title: type,
    isActive() { return true },
    toggle() {},
    ...callbacks,
  }
}

test('failed mount retires both scopes and independently unbinds and destroys all started tools', () => {
  const steps = []
  const first = tool('first', {
    bindSelectionPort(port) { steps.push(port === null ? 'first unbind' : 'first bind') },
    onMount() { steps.push('first mount') },
    destroy() { steps.push('first destroy') },
  })
  const second = tool('second', {
    bindSelectionPort(port) {
      steps.push(port === null ? 'second unbind' : 'second bind')
      if (port === null) throw new Error('unbind failed')
    },
    onMount() { steps.push('second mount'); throw new Error('mount failed') },
    destroy() { steps.push('second destroy') },
  })
  const failures = []
  const mounts = new InlineToolMounts([first, second], runtime, error => failures.push(error.message))
  const [firstLease, secondLease] = mounts.tools
  mounts.start(firstLease, {}, {}, {}, () => steps.push('first revoked'))
  assert.throws(() => mounts.start(secondLease, {}, {}, {}, () => steps.push('second revoked')), /mount failed/)
  mounts.destroy()
  mounts.destroy()
  assert.deepEqual(steps, [
    'first bind', 'first mount', 'second bind', 'second mount',
    'first revoked', 'second revoked',
    'second unbind', 'second destroy', 'first unbind', 'first destroy',
  ])
  assert.deepEqual(failures, ['unbind failed'])
  const next = new InlineToolMounts([first, second], runtime)
  next.destroy()
})

test('one live owner cannot be mounted twice and duplicate sources are rejected before claiming', () => {
  const original = tool('first')
  assert.throws(() => new InlineToolMounts([original, original], runtime), /more than once/)
  const mounted = new InlineToolMounts([original], runtime)
  assert.throws(() => new InlineToolMounts([original], runtime), /already mounted/)
  mounted.destroy()
  const reused = new InlineToolMounts([original], runtime)
  reused.destroy()
})

test('mounted tool snapshots retain original methods, receiver and metadata', () => {
  let reads = 0
  const original = tool('editor', { count: 0 })
  Object.defineProperty(original, 'icon', {
    get() { reads++; return '<i>icon</i>' },
    configurable: true,
  })
  const mounted = new InlineToolMounts([original], runtime)
  const snapshot = mounted.tools[0]
  original.isActive = () => false
  original.title = 'Later title'
  assert.equal(snapshot.icon, '<i>icon</i>')
  assert.equal(snapshot.title, 'editor')
  assert.equal(snapshot.isActive({}), true)
  assert.equal(reads, 1)
  mounted.destroy()
})

test('invalid tool metadata fails before a claim, allowing corrected reuse', () => {
  const invalid = tool('format')
  invalid.icon = 7
  assert.throws(() => new InlineToolMounts([invalid], runtime), /icon must be a string/)
  invalid.icon = '<b></b>'
  const mounted = new InlineToolMounts([invalid], runtime)
  mounted.destroy()
})

test('each failed destroy is contained without hiding later lifecycle cleanup', () => {
  const steps = []
  const errors = []
  const first = tool('first', { destroy() { steps.push('first'); throw new Error('first failed') } })
  const second = tool('second', { destroy() { steps.push('second'); throw new Error('second failed') } })
  const mounted = new InlineToolMounts([first, second], runtime, error => errors.push(error.message))
  for (const t of mounted.tools) mounted.start(t, null, {}, {})
  mounted.destroy()
  assert.deepEqual(steps, ['second', 'first'])
  assert.deepEqual(errors, ['second failed', 'first failed'])
})

test('extension cleanup runs under observation authority and independently completes', () => {
  let observing = false
  const runtimeWithObservation = {
    prepareExtensionValue: operation => operation(),
    observeExtension(operation) {
      assert.equal(observing, false)
      observing = true
      try { return operation() }
      finally { observing = false }
    },
  }
  const calls = []
  const first = tool('first', {
    bindSelectionPort(port) {
      if (port === null) {
        assert.equal(observing, true)
        calls.push('first unbind')
        throw new Error('unbinding failed')
      }
    },
    destroy() { assert.equal(observing, true); calls.push('first destroy') },
  })
  const second = tool('second', {
    destroy() { assert.equal(observing, true); calls.push('second destroy') },
  })
  const errors = []
  const mounts = new InlineToolMounts([first, second], runtimeWithObservation, error => errors.push(error.message))
  for (const item of mounts.tools) mounts.start(item, null, {}, {})
  mounts.destroy()
  assert.deepEqual(calls, ['second destroy', 'first unbind', 'first destroy'])
  assert.deepEqual(errors, ['unbinding failed'])
})
