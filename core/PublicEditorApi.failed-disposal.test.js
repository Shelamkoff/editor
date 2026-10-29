import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorHandle } from './PublicEditorApi.js'
import { DocumentRuntime } from './DocumentRuntime.js'
import { InstanceScope } from './InstanceScope.js'
import { LifecycleScope } from './LifecycleScope.js'
import { claimEditorHolder } from './EditorHolderOwnership.js'

function fixture() {
  const holder = {}
  const failures = { apply: new Error('apply failed'), recovery: new Error('recovery failed') }
  const flags = { fail: false, onApply: () => {}, onRecover: () => {}, onDestroy: () => {} }
  const lifecycleErrors = [], destroyedResources = []
  const lifecycle = new LifecycleScope(error => lifecycleErrors.push(error))
  lifecycle.register(claimEditorHolder(holder))
  lifecycle.register({ destroy() { destroyedResources.push('independent'); throw new Error('independent cleanup failed') } })
  const controller = new AbortController()
  let context, scope
  const schema = { currentVersion: 1, createDefault: () => ({ text: '' }),
    decode: input => ({ dataVersion: 1, data: { text: input.data.text } }),
    encode: data => ({ dataVersion: 1, data: { text: data.text } }),
  }
  const runtime = lifecycle.register(new DocumentRuntime({
    registry: { defaultBlockType: 'custom', hasBlock: () => true, getBlockDefinition: () => ({ type: 'custom', schema }) },
    data: { version: '2.0.0', blocks: [{ id: 'a', type: 'custom', dataVersion: 1, data: { text: 'accepted' } }] },
    projectorFactory({ store, contextFactory }) {
      scope = new InstanceScope({ generation: store.generation })
      context = contextFactory('a', 'custom', controller.signal, () => store.peek('a'), scope)
      return {
        prepare() { return {
          apply() { flags.onApply(); if (flags.fail) throw failures.apply },
          recover() { flags.onRecover(); if (flags.fail) throw failures.recovery },
          finalize() {}, discard() {},
        } },
        destroy() { destroyedResources.push('runtime'); controller.abort(); flags.onDestroy() },
      }
    },
  }))
  let destroyed = false
  const handle = new EditorHandle({ runtime, view: { focus() { throw new Error('must not focus') } },
    isDestroyed: () => destroyed,
    destroy() { destroyed = true; lifecycle.destroy() },
  })
  const fail = () => {
    flags.fail = true
    assert.throws(() => runtime.update('a', () => ({ data: { text: 'rejected' } })), error => (
      error instanceof AggregateError && error.errors[0] === failures.apply && error.errors[1] === failures.recovery
    ))
    assert.equal(runtime.health, 'failed')
  }
  return { handle, runtime, context, scope, holder, flags, fail, destroyedResources, lifecycleErrors }
}

test('a settled failed editor can be publicly disposed once without restoring edit rights', () => {
  const h = fixture()
  const task = h.context.beginTask()
  h.fail()
  assert.equal(h.handle.save().blocks[0].data.text, 'accepted')
  assert.equal(h.handle.canUndo, false)
  let producers = 0
  assert.throws(() => h.runtime.update('a', () => { producers++; return {} }), /failed/)
  assert.throws(() => h.handle.undo(), /failed/)
  assert.throws(() => h.handle.focus(), /failed/)
  assert.equal(producers, 0)
  assert.throws(() => claimEditorHolder(h.holder), /already owns/)
  assert.doesNotThrow(() => h.handle.destroy())
  h.handle.destroy()
  assert.deepEqual(h.destroyedResources, ['runtime', 'independent'])
  assert.equal(h.lifecycleErrors.length, 1)
  assert.equal(h.context.signal.aborted, true)
  assert.equal(task.signal.aborted, true)
  assert.equal(task.commit(() => { producers++; return {} }), false)
  assert.equal(producers, 0)
  assert.equal(h.handle.isReady, false)
  assert.throws(() => h.handle.save(), /destroyed/)
  const successor = claimEditorHolder(h.holder)
  h.handle.destroy()
  assert.throws(() => claimEditorHolder(h.holder), /already owns/)
  successor.destroy()
})

for (const enter of ['prepareExtensionValue', 'observeExtension']) {
  test(`failed health does not authorize public teardown inside ${enter}`, () => {
    const h = fixture()
    h.fail()
    h.runtime[enter](() => {
      assert.throws(() => h.handle.destroy(), /phase/)
      h.runtime[enter](() => assert.throws(() => h.handle.destroy(), /phase/))
      assert.deepEqual(h.destroyedResources, [])
    })
    assert.equal(h.runtime.health, 'failed')
    assert.equal(h.handle.save().blocks[0].data.text, 'accepted')
    h.handle.destroy()
    assert.deepEqual(h.destroyedResources, ['runtime', 'independent'])
  })
}

test('public disposal remains forbidden during forward projection and its active recovery', () => {
  const h = fixture()
  let denials = 0
  const denied = () => {
    assert.throws(() => h.handle.destroy(), /phase/)
    assert.deepEqual(h.destroyedResources, [])
    denials++
  }
  h.flags.onApply = denied
  h.flags.onRecover = denied
  h.fail()
  assert.equal(denials, 2)
  h.handle.destroy()
  assert.deepEqual(h.destroyedResources, ['runtime', 'independent'])
})

test('failed disposal marks the public handle terminal before reentrant cleanup', () => {
  const h = fixture()
  h.fail()
  h.flags.onDestroy = () => {
    assert.equal(h.handle.isReady, false)
    h.handle.destroy()
    assert.throws(() => h.handle.save(), /destroyed/)
    throw new Error('runtime cleanup failed')
  }
  assert.doesNotThrow(() => h.handle.destroy())
  assert.deepEqual(h.destroyedResources, ['runtime', 'independent'])
  assert.equal(h.lifecycleErrors.length, 2)
  const successor = claimEditorHolder(h.holder)
  successor.destroy()
})
