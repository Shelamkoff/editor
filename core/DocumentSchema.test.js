import assert from 'node:assert/strict'
import test from 'node:test'
import { DocumentSchema } from './DocumentSchema.js'

test('document migrations form an isolated deterministic chain', () => {
  const source = {
    version: 'legacy',
    blocks: [{ id: 'a', type: 'paragraph', data: { text: 'before' } }],
  }
  const schema = new DocumentSchema({
    currentVersion: '2',
    versionPolicy: 'strict',
    migrations: [
      {
        from: 'legacy',
        to: '1',
        migrate(document) {
          document.blocks[0].data.text = 'migrated'
          return document
        },
      },
      {
        from: '1',
        to: '2',
        migrate: document => ({ ...document, time: 42 }),
      },
    ],
  })

  const migrated = schema.normalize(source)
  assert.equal(migrated.version, '2')
  assert.equal(migrated.time, 42)
  assert.equal(migrated.blocks[0].data.text, 'migrated')
  assert.equal(source.blocks[0].data.text, 'before')
})

test('strict document version policy rejects an incomplete chain', () => {
  const schema = new DocumentSchema({ currentVersion: '2', versionPolicy: 'strict' })
  assert.throws(
    () => schema.normalize({ version: 'legacy', blocks: [] }),
    /No document migration from version "legacy" to "2"/,
  )
})

test('preserve policy accepts unknown versions without mutating input', () => {
  const source = { version: 'external', blocks: [{ type: 'paragraph', data: {} }] }
  const normalized = new DocumentSchema({ currentVersion: '2' }).normalize(source)
  assert.equal(normalized.version, 'external')
  assert.notEqual(normalized.blocks, source.blocks)
})

test('document normalization accepts JSON-shaped reactive proxies', () => {
  const blocksTarget = [{ id: 'proxy', type: 'paragraph', data: { text: 'Vue' } }]
  const blocksProxy = new Proxy(blocksTarget, {})
  const documentProxy = new Proxy({ version: '2', blocks: blocksProxy }, {})

  const normalized = new DocumentSchema({ currentVersion: '2' }).normalize(documentProxy)

  assert.deepEqual(normalized, { version: '2', blocks: blocksTarget })
  assert.notStrictEqual(normalized.blocks, blocksTarget)
  assert.notStrictEqual(normalized.blocks[0], blocksTarget[0])
})

test('document envelope policy preserves safe fallback and supports strict rejection', () => {
  const schema = new DocumentSchema()
  assert.deepEqual(schema.normalize(null).blocks, [])
  assert.deepEqual(schema.normalize({ blocks: {} }).blocks, [])
  const strict = new DocumentSchema({ versionPolicy: 'strict' })
  assert.throws(() => strict.normalize(null), /must be an object/)
  assert.throws(() => strict.normalize({ blocks: {} }), /must be an array/)
  assert.throws(
    () => new DocumentSchema({
      migrations: [
        { from: 'a', to: 'b', migrate: document => document },
        { from: 'a', to: 'c', migrate: document => document },
      ],
    }),
    /Duplicate document migration source/,
  )
})
