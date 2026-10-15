import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorBlocksApi, EditorHandle } from './PublicEditorApi.js'
import { DocumentRuntime } from './DocumentRuntime.js'
import { createVersionedDataSchema } from '../shared/versionedDataSchema.js'

function setup() {
  const schema = createVersionedDataSchema({ currentVersion: 1, createDefault: () => ({ text: '' }), normalize: data => ({ text: data.text }) })
  const definition = { type: 'paragraph', schema }
  const runtime = new DocumentRuntime({
    registry: { defaultBlockType: 'paragraph', hasBlock: type => type === 'paragraph', getBlockDefinition: type => type === 'paragraph' ? definition : undefined },
    data: { version: '2.0.0', blocks: [{ id: 'a', type: 'paragraph', dataVersion: 1, data: { text: 'A' } }] },
  })
  const controls = []
  const view = {
    setCurrent: value => controls.push(['current', value]),
    select: value => controls.push(['select', value]),
    clearSelection: () => controls.push(['clear']),
    focus: () => controls.push(['focus']),
    reconcileInteraction() {},
  }
  let destroyed = false
  const api = new EditorBlocksApi({ runtime, view, isDestroyed: () => destroyed })
  const handle = new EditorHandle({ runtime, view, blocks: api,
    destroy() { if (!destroyed) { controls.push(['destroy']); destroyed = true; runtime.destroy() } },
    isDestroyed: () => destroyed,
  })
  return { runtime, api, handle, controls }
}

test('public insert captures supported fields once under preparation before dispatch', () => {
  const { runtime, api } = setup()
  let producers = 0
  const reads = []
  const input = Object.fromEntries(['type', 'data', 'tunes', 'inline'].map(key => [key, undefined]))
  for (const key of Object.keys(input)) Object.defineProperty(input, key, {
    get() {
      reads.push(key)
      assert.throws(() => runtime.update('a', () => { producers++; return {} }), /prepar/)
      return key === 'type' ? 'paragraph' : key === 'data' ? { text: 'Inserted' } : undefined
    },
  })
  Object.defineProperty(input, 'unrelated', { get() { throw new Error('Unrelated property observed') } })
  const id = api.insert(input)
  assert.deepEqual(reads, ['type', 'data', 'tunes', 'inline'])
  assert.equal(producers, 0)
  assert.equal(runtime.get(id).data.text, 'Inserted')
  runtime.destroy()
})

test('public controls reject protected dispatch before view and teardown effects', () => {
  const { runtime, api, handle, controls } = setup()
  runtime.prepareExtensionValue(() => {
    for (const operation of [
      () => api.setCurrent('a'), () => api.select(['a']), () => api.clearSelection(),
      () => api.focus('a'), () => handle.focus(), () => handle.destroy(),
    ]) assert.throws(operation, /prepar/)
    assert.equal(handle.isReady, true)
  })
  assert.deepEqual(controls, [])
  handle.focus()
  handle.destroy()
  handle.destroy()
  assert.deepEqual(controls, [['focus'], ['destroy']])
})

test('caught public insert pre-dispatch rejection preserves an ordinary outer draft', () => {
  const { runtime, api } = setup()
  runtime.interact('outer', () => {
    runtime.update('a', () => ({ data: { text: 'Kept' } }))
    assert.throws(() => api.insert({ type: 'paragraph', data: { invalid: undefined } }), /non-JSON/)
  })
  assert.equal(runtime.get('a').data.text, 'Kept')
  assert.equal(runtime.canUndo, true)
  runtime.undo()
  assert.equal(runtime.get('a').data.text, 'A')
  runtime.destroy()
})

test('caught insertion preparation failure after dispatch poisons the outer draft', () => {
  const { runtime, api } = setup()
  assert.throws(() => runtime.interact('outer', () => {
    runtime.update('a', () => ({ data: { text: 'Rolled back' } }))
    try { api.insert({ type: 'missing' }) } catch {}
  }), /Unknown block/)
  assert.equal(runtime.get('a').data.text, 'A')
  assert.equal(runtime.canUndo, false)
  runtime.destroy()
})
