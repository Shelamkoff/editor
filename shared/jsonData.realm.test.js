import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { cloneEditorData } from './cloneEditorData.js'
import { DocumentSchema } from '../core/DocumentSchema.js'

test('JSON data accepts plain objects created in a different realm', () => {
  const foreign = runInNewContext('({ blocks: [{ id: "a", type: "paragraph", data: { text: "foreign" } }], version: "1" })')
  const cloned = cloneEditorData(foreign)
  assert.deepEqual(cloned, { blocks: [{ id: 'a', type: 'paragraph', data: { text: 'foreign' } }], version: '1' })
  assert.equal(Object.getPrototypeOf(cloned), Object.prototype)
  assert.notStrictEqual(cloned.blocks[0].data, foreign.blocks[0].data)
  assert.equal(new DocumentSchema({ currentVersion: '1' }).normalize(foreign).blocks[0].data.text, 'foreign')
})

test('cross-realm JSON support must not admit exotic or class instances', () => {
  for (const source of ['new Date()', 'new Map()', 'new (class Example { constructor() { this.x = 1 } })()', 'Object.create({ inherited: true })']) {
    assert.throws(() => cloneEditorData(runInNewContext(source)), /non-JSON object/)
  }
})

test('foreign JSON permits null prototypes and reactive proxies without preserving foreign references', () => {
  const foreign = runInNewContext('new Proxy({ nested: Object.assign(Object.create(null), { count: 2 }), list: [{ text: "ok" }] }, {})')
  assert.deepEqual(cloneEditorData(foreign), { nested: { count: 2 }, list: [{ text: 'ok' }] })
})

test('an apparent root prototype with a forged constructor is not a plain JSON object', () => {
  const forged = Object.create(null)
  Object.defineProperty(forged, 'constructor', { value: Object })
  assert.throws(() => cloneEditorData(Object.create(forged)), /non-JSON object/)
  let reads = 0
  const accessorPrototype = Object.create(null)
  Object.defineProperty(accessorPrototype, 'constructor', { get() { reads++; throw new Error('must not execute') } })
  assert.throws(() => cloneEditorData(Object.create(accessorPrototype)), /non-JSON object/)
  assert.equal(reads, 0)
})
