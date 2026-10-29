import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentRuntime } from './DocumentRuntime.js'
import { ExtensionRegistry } from './ExtensionRegistry.js'
import { InstanceScope } from './InstanceScope.js'
import { EditorHandle } from './PublicEditorApi.js'

function fixture({ staged = false } = {}) {
  const flags = { onDecode: null, onValue: null, decodes: 0, valueReads: 0 }
  const ownerDocument = { createElement() { throw new Error('This context test does not mount DOM') } }
  const blockSchema = { currentVersion: 1, createDefault: () => ({ text: '' }),
    decode: input => ({ dataVersion: 1, data: { text: input.data.text } }),
    encode: data => ({ dataVersion: 1, data: { text: data.text } }),
  }
  const inlineSchema = { currentVersion: 1, createDefault: () => ({ label: 'Widget' }),
    decode(input) {
      flags.decodes++
      flags.onDecode?.()
      return { dataVersion: 1, data: {
        get label() { flags.valueReads++; flags.onValue?.(); return input.data.label },
      } }
    },
    encode: data => ({ dataVersion: 1, data: { label: data.label } }),
  }
  const definition = (type, schema) => ({ type, schema, icon: '', label: { key: type, fallback: type },
    setup: () => ({ create() { throw new Error('Not used by the context seam') }, destroy() {} }),
  })
  const registry = new ExtensionRegistry({ ownerDocument, acquireStyles: false,
    blocks: [definition('custom', blockSchema)], inline: [definition('badge', inlineSchema)],
  })
  const owner = new AbortController(), inlineOwner = new AbortController()
  let context, blockContext, scope, parent, destroyed = false
  const runtime = new DocumentRuntime({ registry, ownerDocument, richTextNormalizer: value => value,
    data: { version: '2.0.0', blocks: [
      { id: 'a', type: 'custom', dataVersion: 1, data: { text: '{{ref}}' },
        inline: { ref: { type: 'badge', dataVersion: 1, data: { label: 'Accepted' } } } },
      { id: 'b', type: 'custom', dataVersion: 1, data: { text: 'Sibling' } },
    ] },
    projectorFactory({ store, contextFactory }) {
      parent = new InstanceScope({ generation: store.generation, staged })
      blockContext = contextFactory('a', 'custom', owner.signal, () => store.peek('a'), parent)
      scope = new InstanceScope({ generation: store.generation, staged })
      context = blockContext.createInlineWidgetContext('text', 'ref', 'badge', inlineOwner.signal, scope)
      return { prepare: () => ({ apply() {}, recover() {}, finalize() {}, discard() {} }),
        setReadOnly(value) { parent.setReadOnly(value) },
        destroy() { owner.abort(); inlineOwner.abort() },
      }
    },
  })
  const handle = new EditorHandle({ runtime, view: { focus() { throw new Error('Unauthorized focus') } },
    isDestroyed: () => destroyed,
    destroy() { destroyed = true; runtime.destroy(); registry.destroy() },
  })
  flags.decodes = flags.valueReads = 0
  return { runtime, handle, context, blockContext, scope, parent, flags }
}

test('registered inline getData decoder has no synchronous sibling-write authority', () => {
  const h = fixture()
  try {
    const before = h.runtime.save().blocks
    const revision = h.runtime.revision
    let producers = 0
    h.flags.onDecode = () => {
      assert.throws(() => h.runtime.update('b', () => {
        producers++
        return { data: { text: 'Unwanted nested write' } }
      }), /prepar/)
    }
    assert.deepEqual(h.context.getData(), { label: 'Accepted' })
    assert.equal(producers, 0)
    assert.deepEqual(h.runtime.save().blocks, before)
    assert.equal(h.runtime.revision, revision)
    assert.equal(h.runtime.canUndo, false)
    assert.equal(h.flags.decodes, 1)
    assert.equal(h.flags.valueReads, 1)
  } finally { h.handle.destroy() }
})

for (const boundary of ['onDecode', 'onValue']) {
  test(`inline ${boundary} cannot borrow read authority for control, DOM or task operations`, () => {
    const h = fixture()
    try {
      const before = h.runtime.save().blocks
      let producers = 0
      const producer = () => { producers++; return {} }
      h.flags[boundary] = () => {
        for (const operation of [
          () => h.runtime.update('b', producer),
          () => h.runtime.setReadOnly(true),
          () => h.handle.focus(),
          () => h.handle.destroy(),
          () => h.context.beginTask(),
          () => h.context.updateData(producer),
          () => h.context.commitDomMutation(producer),
          () => h.blockContext.beginTask(),
          () => h.blockContext.updateData(producer),
        ]) assert.throws(operation, /prepar/)
      }
      const value = h.context.getData()
      assert.deepEqual(value, { label: 'Accepted' })
      assert.equal(Object.isFrozen(value), true)
      assert.throws(() => { value.label = 'mutated' }, TypeError)
      assert.equal(producers, 0)
      assert.equal(h.flags.decodes, 1)
      assert.equal(h.flags.valueReads, 1)
      assert.equal(h.handle.isReady, true)
      assert.equal(h.runtime.readOnly, false)
      assert.equal(h.runtime.canUndo, false)
      assert.deepEqual(h.runtime.save().blocks, before)
      h.runtime.update('b', () => ({ data: { text: 'Later independent host write' } }))
      assert.equal(h.runtime.get('b').data.text, 'Later independent host write')
    } finally { h.handle.destroy() }
  })
}

for (const staged of [false, true]) {
  test(`a ${staged ? 'staged' : 'live'} read-only inline instance retains protected decoding`, () => {
    const h = fixture({ staged })
    try {
      h.runtime.setReadOnly(true)
      let producers = 0
      h.flags.onValue = () => assert.throws(() => h.runtime.update('b', () => {
        producers++; return {}
      }, 'host'), /prepar/)
      assert.deepEqual(h.context.getData(), { label: 'Accepted' })
      assert.equal(h.context.isReadOnly(), true)
      assert.equal(producers, 0)
      assert.equal(h.flags.decodes, 1)
      assert.equal(h.flags.valueReads, 1)
    } finally { h.handle.destroy() }
  })
}

for (const boundary of ['onDecode', 'onValue']) {
  test(`retirement during ${boundary} rejects the result and later reads without another decoder call`, () => {
    const h = fixture()
    try {
      h.flags[boundary] = () => h.scope.revoke()
      assert.throws(() => h.context.getData(), { name: 'AbortError' })
      assert.equal(h.flags.decodes, 1)
      assert.throws(() => h.context.getData(), { name: 'AbortError' })
      assert.equal(h.flags.decodes, 1)
      assert.equal(h.runtime.canUndo, false)
    } finally { h.handle.destroy() }
  })
}

test('already revoked inline contexts reject before the captured decoder or result accessors execute', () => {
  const h = fixture()
  try {
    h.parent.revoke()
    assert.throws(() => h.context.getData(), { name: 'AbortError' })
    assert.equal(h.flags.decodes, 0)
    assert.equal(h.flags.valueReads, 0)
  } finally { h.handle.destroy() }
})

test('inline decoder failures preserve identity and leave a later valid read usable', () => {
  const h = fixture()
  try {
    const failure = new Error('decoder failed')
    h.flags.onDecode = () => { throw failure }
    assert.throws(() => h.context.getData(), error => error === failure)
    assert.equal(h.runtime.health, 'ready')
    assert.equal(h.runtime.canUndo, false)
    h.flags.onDecode = null
    assert.deepEqual(h.context.getData(), { label: 'Accepted' })
    assert.equal(h.flags.decodes, 2)
    assert.equal(h.flags.valueReads, 1)
  } finally { h.handle.destroy() }
})

test('a protected decoder in one editor does not remove an independent editor\'s rights', () => {
  const first = fixture(), second = fixture()
  try {
    first.flags.onDecode = () => second.runtime.update('b', () => ({ data: { text: 'Independent' } }))
    assert.deepEqual(first.context.getData(), { label: 'Accepted' })
    assert.equal(first.runtime.canUndo, false)
    assert.equal(second.runtime.get('b').data.text, 'Independent')
    assert.equal(second.runtime.canUndo, true)
  } finally { first.handle.destroy(); second.handle.destroy() }
})

test('staged future-generation inline data remains readable but a stale active occurrence does not', () => {
  const h = fixture({ staged: true })
  try {
    h.scope.configure({ generation: h.runtime.generation + 1 })
    assert.deepEqual(h.context.getData(), { label: 'Accepted' })
    assert.equal(h.flags.decodes, 1)
    h.scope.activate()
    assert.throws(() => h.context.getData(), { name: 'AbortError' })
    assert.equal(h.flags.decodes, 1)
  } finally { h.handle.destroy() }
})

for (const owner of ['context', 'blockContext']) {
  test(`${owner} task captures options under the actual runtime guard`, () => {
    const h = fixture()
    try {
      const task = h[owner].beginTask()
      const initial = h.runtime.save().blocks, revision = h.runtime.revision
      let reads = 0, producers = 0, deniedProducers = 0
      const entered = new Error('admitted producer boundary')
      const denied = () => { deniedProducers++; return {} }
      assert.throws(() => task.commit(current => {
        producers++
        assert.deepEqual(current, owner === 'context' ? { label: 'Accepted' } : { text: '{{ref}}' })
        throw entered
      }, {
        get mergeWithPreviousField() {
          reads++
          assert.throws(() => h.runtime.update('b', denied, 'host'), /prepar/)
          assert.throws(() => h.runtime.setReadOnly(true), /prepar/)
          assert.throws(() => h.handle.destroy(), /phase/)
          assert.throws(() => h.handle.focus(), /phase/)
          assert.throws(() => h[owner].beginTask(), /prepar/)
          assert.equal(task.commit(denied, { get mergeWithPreviousField() { throw new Error('recursive input') } }), false)
          return owner === 'context' ? 'label' : 'text'
        },
      }), error => error === entered)
      assert.equal(reads, 1)
      assert.equal(producers, 1)
      assert.equal(deniedProducers, 0)
      assert.equal(task.signal.aborted, true)
      assert.equal(task.commit(denied), false)
      assert.equal(h.runtime.revision, revision)
      assert.equal(h.runtime.canUndo, false)
      assert.deepEqual(h.runtime.save().blocks, initial)
    } finally { h.handle.destroy() }
  })
}

test('inline options are captured once under preparation, before the admitted producer', () => {
  const h = fixture()
  try {
    let reads = 0, deniedProducers = 0, producers = 0
    const before = h.runtime.revision
    const entered = new Error('admitted inline producer boundary')
    assert.throws(() => h.context.updateData(current => {
      producers++
      assert.deepEqual(current, { label: 'Accepted' })
      throw entered
    }, {
      get trailingText() {
        reads++
        const denied = () => { deniedProducers++; return {} }
        assert.throws(() => h.runtime.update('b', denied, 'host'), /prepar/)
        assert.throws(() => h.runtime.setReadOnly(true), /prepar/)
        assert.throws(() => h.handle.destroy(), /phase/)
        assert.throws(() => h.context.updateData(denied), /prepar/)
        assert.throws(() => h.context.beginTask(), /prepar/)
        return ''
      },
      get unused() { throw new Error('Unrelated option was enumerated') },
    }), error => error === entered)
    assert.equal(reads, 1)
    assert.equal(producers, 1)
    assert.equal(deniedProducers, 0)
    assert.equal(h.context.getData().label, 'Accepted')
    assert.equal(h.runtime.revision, before)
    assert.equal(h.runtime.canUndo, false)
  } finally { h.handle.destroy() }
})

for (const action of ['revoked', 'read-only']) {
  test(`inline ${action} rejects before caller option reads and its producer`, () => {
    const h = fixture()
    try {
      if (action === 'revoked') h.scope.revoke()
      else h.runtime.setReadOnly(true)
      let reads = 0, producers = 0
      assert.equal(h.context.updateData(() => { producers++; return {} }, {
        get trailingText() { reads++; throw new Error('denied input') },
      }), undefined)
      assert.equal(reads, 0)
      assert.equal(producers, 0)
      assert.equal(h.runtime.canUndo, false)
    } finally { h.handle.destroy() }
  })
}

for (const action of ['revoke', 'mode round-trip']) {
  test(`inline option ${action} revalidates its occurrence before dispatch`, () => {
    const h = fixture()
    try {
      const before = h.runtime.save().blocks
      let producers = 0
      assert.equal(h.context.updateData(() => { producers++; return {} }, {
        get trailingText() {
          if (action === 'revoke') h.scope.revoke()
          else { h.scope.setReadOnly(true); h.scope.setReadOnly(false) }
          return ''
        },
      }), undefined)
      assert.equal(producers, 0)
      assert.deepEqual(h.runtime.save().blocks, before)
      assert.equal(h.runtime.canUndo, false)
    } finally { h.handle.destroy() }
  })
}

test('invalid inline options are rejected before a producer, without poisoning later authoring', () => {
  const h = fixture()
  try {
    let producers = 0
    for (const trailingText of [1, {}, 'one\ntwo', 'one\rtwo']) {
      assert.throws(() => h.context.updateData(() => { producers++; return {} }, { trailingText }), /single-line/)
    }
    const failure = new Error('trailing option failed')
    assert.throws(() => h.context.updateData(() => { producers++; return {} }, {
      get trailingText() { throw failure },
    }), error => error === failure)
    assert.equal(producers, 0)
    assert.equal(h.runtime.canUndo, false)
    const entered = new Error('valid producer entered')
    assert.throws(() => h.context.updateData(current => {
      producers++
      assert.deepEqual(current, { label: 'Accepted' })
      throw entered
    }), error => error === entered)
    assert.equal(producers, 1)
    assert.equal(h.context.getData().label, 'Accepted')
  } finally { h.handle.destroy() }
})

test('deferred application work after a protected read receives fresh ordinary admission', async () => {
  const h = fixture()
  try {
    let settle
    const finished = new Promise(resolve => { settle = resolve })
    h.flags.onDecode = () => queueMicrotask(() => {
      try {
        h.runtime.update('b', () => ({ data: { text: 'Deferred host edit' } }), 'host')
        settle(null)
      } catch (error) { settle(error) }
    })
    assert.deepEqual(h.context.getData(), { label: 'Accepted' })
    assert.equal(h.runtime.get('b').data.text, 'Sibling')
    assert.equal(await finished, null)
    assert.equal(h.runtime.get('b').data.text, 'Deferred host edit')
    assert.equal(h.runtime.canUndo, true)
  } finally { h.handle.destroy() }
})
