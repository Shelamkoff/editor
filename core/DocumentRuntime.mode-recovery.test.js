import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentRuntime } from './DocumentRuntime.js'
import { BlockReconciler } from './BlockReconciler.js'
import { ReadOnlyRecoveryError } from './ReadOnlyRecoveryError.js'

// Ownership and control state only, not browser layout or rich-text parsing.
class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = document
    this.parentNode = null
    this.children = []
    this.dataset = {}
    this.style = {}
  }
  get firstChild() { return this.children[0] ?? null }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null }
  appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child }
  insertBefore(child, anchor) {
    child.remove()
    const index = anchor === null ? this.children.length : this.children.indexOf(anchor)
    assert.ok(index >= 0)
    child.parentNode = this
    this.children.splice(index, 0, child)
    return child
  }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); for (const child of children) this.appendChild(child) }
  remove() { if (this.parentNode) { const siblings = this.parentNode.children; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null } }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false }
}

function thrown(operation) {
  try { operation() } catch (error) { return error }
  assert.fail('Expected the operation to throw')
}

function fixture({ readOnly = false, inlineProjection = null } = {}) {
  const ownerDocument = { defaultView: { HTMLElement: Element, AbortController },
    createElement(tag) { return new Element(tag, ownerDocument) },
  }
  const container = ownerDocument.createElement('main')
  const flags = { armed: false, forward: new Error('forward mode failed'), rollbacks: new Map(), restore: [] }
  const controls = [], calls = [], commits = []
  const schema = {
    currentVersion: 1,
    createDefault: () => ({ text: '' }),
    decode: input => ({ dataVersion: 1, data: { text: input.data.text } }),
    encode: data => ({ dataVersion: 1, data: { text: data.text } }),
  }
  const registry = {
    defaultBlockType: 'custom',
    hasBlock: type => type === 'custom',
    getBlockDefinition: () => ({ type: 'custom', schema }),
    getInlineDefinition: () => undefined,
    getBlockRuntime: () => ({ create(data, context) {
      if (context.restoring && flags.restore.length) throw flags.restore[0]
      const element = ownerDocument.createElement('button')
      const control = { element, context, id: data.text, destroyed: 0 }
      controls.push(control)
      let current = data
      return { element,
        read: () => ({ ...current }),
        update(next) { current = next },
        setReadOnly(value) {
          if (flags.armed && !context.restoring) {
            calls.push([control.id, value])
            if (value === readOnly && flags.rollbacks.has(control.id)) throw flags.rollbacks.get(control.id)
          }
          element.disabled = value
          if (flags.armed && !context.restoring && value !== readOnly && control.id === 'b') throw flags.forward
        },
        destroy() { control.destroyed++ },
      }
    } }),
  }
  let reconciler
  const runtime = new DocumentRuntime({ registry, ownerDocument, readOnly,
    richTextNormalizer: value => value,
    data: { version: '2.0.0', blocks: ['a', 'b'].map(id => ({ id, type: 'custom', dataVersion: 1, data: { text: id } })) },
    onCommit: event => commits.push(event),
    projectorFactory({ contextFactory, activationResolver, projectPresentation }) {
      reconciler = new BlockReconciler({ container, registry, contextFactory, activationResolver, projectPresentation, inlineProjection, readOnly })
      return reconciler
    },
  })
  const modes = () => ['a', 'b'].map(id => reconciler.getElement(id).firstChild.disabled)
  return { runtime, reconciler, flags, controls, calls, commits, modes }
}

test('a null rollback throw restores committed controls instead of leaving public and instance modes split', () => {
  const h = fixture()
  try {
    const before = h.runtime.save().blocks
    const revision = h.runtime.revision
    const task = h.controls[0].context.beginTask()
    h.flags.rollbacks.set('a', null)
    h.flags.armed = true
    assert.equal(thrown(() => h.runtime.setReadOnly(true)), h.flags.forward)
    assert.equal(h.runtime.readOnly, false)
    assert.equal(h.runtime.health, 'ready')
    assert.deepEqual(h.modes(), [false, false])
    assert.deepEqual(h.runtime.save().blocks, before)
    assert.equal(h.runtime.revision, revision)
    assert.equal(h.runtime.canUndo, false)
    assert.deepEqual(h.commits, [])
    assert.equal(task.signal.aborted, true)
    let producers = 0
    assert.equal(task.commit(() => { producers++; return { text: 'stale' } }), false)
    assert.equal(producers, 0)
  } finally { h.runtime.destroy() }
})

const payloads = [undefined, null, false, 0, '', NaN, new Error('rollback error')]
for (const readOnly of [false, true]) {
  for (const payload of payloads) {
    test(`mode ${readOnly}: every rollback throw (${String(payload)}) restores coherent controls`, () => {
      const h = fixture({ readOnly })
      try {
        const before = h.runtime.save().blocks
        const revision = h.runtime.revision
        h.flags.rollbacks.set('a', payload)
        h.flags.armed = true
        assert.equal(thrown(() => h.runtime.setReadOnly(!readOnly)), h.flags.forward)
        assert.equal(h.runtime.readOnly, readOnly)
        assert.equal(h.runtime.health, 'ready')
        assert.deepEqual(h.modes(), [readOnly, readOnly])
        assert.deepEqual(h.calls, [['a', !readOnly], ['b', !readOnly], ['b', readOnly], ['a', readOnly]])
        assert.deepEqual(h.runtime.save().blocks, before)
        assert.equal(h.runtime.revision, revision)
        assert.deepEqual(h.commits, [])
        for (const control of h.controls.slice(0, 2)) {
          assert.equal(control.context.signal.aborted, true)
          assert.equal(control.destroyed, 1)
        }
        // The reconstructed current owners must still accept both mode changes.
        h.flags.armed = false
        h.runtime.setReadOnly(!readOnly)
        assert.deepEqual(h.modes(), [!readOnly, !readOnly])
        h.runtime.setReadOnly(readOnly)
        assert.deepEqual(h.modes(), [readOnly, readOnly])
      } finally { h.runtime.destroy() }
    })
  }
}

for (const payload of payloads) {
  test(`a forward throw (${String(payload)}) with successful reversal preserves mounted owners`, () => {
    const h = fixture()
    try {
      const originals = h.controls.map(control => control.element)
      h.flags.forward = payload
      h.flags.armed = true
      assert.ok(Object.is(thrown(() => h.runtime.setReadOnly(true)), payload))
      assert.equal(h.runtime.health, 'ready')
      assert.equal(h.runtime.readOnly, false)
      assert.deepEqual(h.modes(), [false, false])
      assert.deepEqual(h.controls.map(control => control.element), originals)
      assert.ok(h.controls.every(control => !control.context.signal.aborted && control.destroyed === 0))
      assert.deepEqual(h.calls, [['a', true], ['b', true], ['b', false], ['a', false]])
      assert.equal(h.runtime.canUndo, false)
    } finally { h.runtime.destroy() }
  })
}

for (const payload of payloads) {
  test(`secondary restoration throw (${String(payload)}) records every failure and stops authoring`, () => {
    const h = fixture()
    const before = h.runtime.save().blocks
    try {
      h.flags.forward = undefined
      h.flags.rollbacks.set('a', null)
      h.flags.rollbacks.set('b', false)
      h.flags.restore.push(payload)
      h.flags.armed = true
      const failure = thrown(() => h.runtime.setReadOnly(true))
      assert.ok(failure instanceof ReadOnlyRecoveryError)
      assert.deepEqual(failure.errors, [undefined, false, null, payload])
      assert.equal(h.runtime.readOnly, false)
      assert.equal(h.runtime.health, 'failed')
      assert.deepEqual(h.runtime.save().blocks, before)
      assert.equal(h.runtime.canUndo, false)
      let producers = 0
      assert.throws(() => h.runtime.update('a', () => { producers++; return {} }), /failed/)
      assert.equal(producers, 0)
      assert.throws(() => h.runtime.setReadOnly(true), /failed/)
      assert.deepEqual(h.calls, [['a', true], ['b', true], ['b', false], ['a', false]])
    } finally {
      h.runtime.destroy()
      h.runtime.destroy()
      assert.ok(h.controls.every(control => control.context.signal.aborted && control.destroyed === 1))
    }
  })
}

test('ordinary successful mode changes keep their current instances and do not author history', () => {
  const h = fixture()
  try {
    const originals = h.controls.map(control => control.element)
    h.runtime.setReadOnly(true)
    h.runtime.setReadOnly(true)
    assert.deepEqual(h.modes(), [true, true])
    h.runtime.setReadOnly(false)
    assert.deepEqual(h.modes(), [false, false])
    assert.deepEqual(h.controls.map(control => control.element), originals)
    assert.deepEqual(h.commits, [])
    assert.ok(h.controls.every(control => !control.context.signal.aborted && control.destroyed === 0))
  } finally { h.runtime.destroy() }
})
