import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultInlineTools } from './defaults.js'

test('default inline tool type filters reject inherited sparse entries without reading them', () => {
  let reads = 0
  const prototype = Object.create(Array.prototype)
  Object.defineProperty(prototype, '0', {
    configurable: true,
    get() { reads++; return 'bold' },
  })
  const types = []
  Object.setPrototypeOf(types, prototype)
  types.length = 1

  assert.throws(() => createDefaultInlineTools({ types }), /dense array/)
  assert.equal(reads, 0)
  assert.deepEqual(createDefaultInlineTools({ types: ['bold', 'italic'] }).map(tool => tool.type), ['bold', 'italic'])
})

test('default inline tool options ignore inherited configuration entries', () => {
  let reads = 0
  const prototype = {}
  Object.defineProperty(prototype, 'types', {
    configurable: true,
    get() { reads++; throw new Error('inherited inline tool option accessed') },
  })
  const options = Object.create(prototype)

  assert.doesNotThrow(() => createDefaultInlineTools(options))
  assert.equal(reads, 0)
  assert.throws(() => createDefaultInlineTools(null), /options must be an object/)
})


test('default inline preset exposes unique complete tool instances', () => {
  const tools = createDefaultInlineTools()
  const types = tools.map(tool => tool.type)
  assert.equal(types.length, 12)
  assert.equal(new Set(types).size, types.length)
  assert.deepEqual(types, [
    'bold','italic','strikethrough','link','code','marker',
    'bgcolor','fontSize','script','align','caseTransform','clearFormatting',
  ])
  for (const tool of tools) {
    assert.equal(typeof tool.type, 'string')
    assert.equal(typeof tool.title, 'string')
    assert.equal(typeof tool.toggle, 'function')
  }
})
