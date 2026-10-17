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
  for (const item of mounts.tools) mounts.start(item, {}, {}, {})
  mounts.destroy()
  assert.deepEqual(calls, ['second destroy', 'first unbind', 'first destroy'])
  assert.deepEqual(errors, ['unbinding failed'])
})

test('all inline tool sources are reserved before reading extension metadata', () => {
  const first = tool('first')
  const shared = tool('shared')
  let attempts = 0
  Object.defineProperty(first, 'icon', {
    configurable: true,
    get() {
      attempts++
      // Another editor/toolbar may be constructed synchronously by a getter.
      // It cannot acquire an instance reserved by this construction.
      assert.throws(() => new InlineToolMounts([shared], runtime), /already mounted/)
      return '<i>first</i>'
    },
  })
  const mounted = new InlineToolMounts([first, shared], runtime)
  assert.equal(attempts, 1)
  assert.deepEqual(mounted.tools.map(entry => entry.type), ['first', 'shared'])
  mounted.destroy()

  // Neither reservation may survive the owner's teardown.
  const reused = new InlineToolMounts([shared], runtime)
  reused.destroy()
})

test('failed later tool metadata capture releases every earlier reservation', () => {
  const first = tool('first')
  const second = tool('second')
  second.icon = null
  assert.throws(
    () => new InlineToolMounts([first, second], runtime),
    /icon must be a string/,
  )
  second.icon = '<i>second</i>'
  const mounted = new InlineToolMounts([first, second], runtime)
  assert.deepEqual(mounted.tools.map(entry => entry.type), ['first', 'second'])
  mounted.destroy()
})

test('synchronous revocation during port binding prevents an onMount on a destroyed owner', () => {
  const calls = []
  let mounts
  const source = tool('reentrant', {
    bindSelectionPort(port) {
      calls.push(port === null ? 'unbind' : 'bind')
      if (port !== null) mounts.destroy()
    },
    onMount() { calls.push('mounted after revocation') },
    destroy() { calls.push('destroy') },
  })
  mounts = new InlineToolMounts([source], runtime)
  mounts.start(mounts.tools[0], {}, {}, {}, () => calls.push('revoke'))
  assert.deepEqual(calls, ['bind', 'revoke', 'unbind', 'destroy'])
  mounts.destroy()
  const reused = new InlineToolMounts([source], runtime)
  reused.destroy()
})

test('inline mount callbacks run inside the observation guard and cannot mutate the document', () => {
  let observing = false
  let forbiddenMutations = 0
  let observedCalls = 0
  const guardedRuntime = {
    prepareExtensionValue: operation => operation(),
    observeExtension(operation) {
      assert.equal(observing, false, 'nested observation guard leaked')
      observing = true
      try { return operation() }
      finally { observing = false }
    },
  }
  const attemptMutation = () => {
    if (observing) return // a real DocumentRuntime rejects this operation
    forbiddenMutations++
  }
  const source = tool('mount-guard', {
    bindSelectionPort(port) {
      if (port !== null) {
        observedCalls++
        attemptMutation()
      }
    },
    onMount() {
      observedCalls++
      attemptMutation()
    },
  })
  const mounts = new InlineToolMounts([source], guardedRuntime)
  try {
    mounts.start(mounts.tools[0], {}, {}, {})
    assert.equal(observedCalls, 2)
    assert.equal(forbiddenMutations, 0,
      'inline setup hooks escaped observation authority and mutated live editor state')
  } finally { mounts.destroy() }
})

test('thenable inspection after inline mount hooks cannot escape observation authority', () => {
  let observing = false
  let unguarded = 0
  const calls = []
  const runtimeWithObservation = {
    prepareExtensionValue: operation => operation(),
    observeExtension(operation) {
      assert.equal(observing, false)
      observing = true
      try { return operation() }
      finally { observing = false }
    },
  }
  const result = () => ({
    get then() {
      calls.push('then getter')
      if (!observing) unguarded++
      return () => {}
    },
  })
  const source = tool('thenable-acquisition', {
    bindSelectionPort(port) {
      if (port !== null) return result()
    },
  })
  const mounts = new InlineToolMounts([source], runtimeWithObservation)
  try {
    assert.throws(() => mounts.start(mounts.tools[0], {}, {}, {}), /synchronously/)
    assert.deepEqual(calls, ['then getter'])
    assert.equal(unguarded, 0, 'thenable getter from bindSelectionPort escaped observation phase')
  } finally { mounts.destroy() }
})

test('onMount result inspection cannot run mutation-capable getter after the guard exits', () => {
  let observing = false
  let unguarded = 0
  const runtimeWithObservation = {
    prepareExtensionValue: operation => operation(),
    observeExtension(operation) {
      assert.equal(observing, false)
      observing = true
      try { return operation() }
      finally { observing = false }
    },
  }
  const source = tool('thenable-on-mount', {
    onMount() {
      return {
        get then() {
          if (!observing) unguarded++
          return () => {}
        },
      }
    },
  })
  const mounts = new InlineToolMounts([source], runtimeWithObservation)
  try {
    assert.throws(() => mounts.start(mounts.tools[0], {}, {}, {}), /synchronously/)
    assert.equal(unguarded, 0, 'onMount thenable getter was evaluated after observation')
  } finally { mounts.destroy() }
})

test('inline tool teardown examines returned thenables while observation is still active', () => {
  let observing = false
  let unguarded = 0
  const errors = []
  const runtimeWithObservation = {
    prepareExtensionValue: operation => operation(),
    observeExtension(operation) {
      assert.equal(observing, false)
      observing = true
      try { return operation() }
      finally { observing = false }
    },
  }
  const result = () => ({
    get then() {
      if (!observing) unguarded++
      return () => {}
    },
  })
  const source = tool('thenable-cleanup', {
    bindSelectionPort(port) { if (port === null) return result() },
    destroy() { return result() },
  })
  const mounts = new InlineToolMounts([source], runtimeWithObservation, err => errors.push(err.message))
  mounts.start(mounts.tools[0], {}, {}, {})
  mounts.destroy()
  assert.equal(unguarded, 0, 'cleanup thenable getters bypassed observation protection')
  assert.deepEqual(errors, [
    'Extension operation must complete synchronously',
    'Extension operation must complete synchronously',
  ])
})
