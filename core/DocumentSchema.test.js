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

test('document schema rejects unknown runtime version policies', () => {
  for (const invalid of ['strcit', '', null, true, 1]) {
    assert.throws(
      () => new DocumentSchema({ versionPolicy: invalid }),
      /versionPolicy must be "preserve" or "strict"/,
    )
  }
})

test('document schema requires a non-empty runtime current version', () => {
  for (const invalid of ['', null, false, 42]) {
    assert.throws(
      () => new DocumentSchema({ currentVersion: invalid }),
      /currentVersion must be a non-empty string/,
    )
  }
})


test('document schema executes the same migration members it validated', () => {
  const reads = { from: 0, to: 0, migrate: 0 }
  let receiver = null
  const migration = {
    get from() {
      reads.from++
      return reads.from === 1 ? 'legacy' : 'drifted-from'
    },
    get to() {
      reads.to++
      return reads.to === 1 ? '2' : 'drifted-to'
    },
    get migrate() {
      reads.migrate++
      if (reads.migrate > 1) throw new Error('migration method was reread')
      return function (document) {
        receiver = this
        return { ...document, blocks: [...document.blocks] }
      }
    },
  }

  const schema = new DocumentSchema({
    currentVersion: '2',
    versionPolicy: 'strict',
    migrations: [migration],
  })

  const result = schema.normalize({ version: 'legacy', blocks: [] })
  assert.equal(result.version, '2')
  assert.deepEqual(reads, { from: 1, to: 1, migrate: 1 })
  assert.strictEqual(receiver, migration, 'migration method receiver must remain the supplied descriptor')
})


test('DocumentSchema snapshots standalone options and rejects sparse migrations', () => {
  const reads = { currentVersion: 0, versionPolicy: 0, migrations: 0 }
  const migration = { from: 'legacy', to: '2', migrate: document => document }
  const migrations = [migration]
  const options = {
    get currentVersion() { reads.currentVersion++; return '2' },
    get versionPolicy() { reads.versionPolicy++; return 'strict' },
    get migrations() { reads.migrations++; return migrations },
  }

  const schema = new DocumentSchema(options)
  assert.deepEqual(reads, { currentVersion: 1, versionPolicy: 1, migrations: 1 })
  assert.equal(schema.normalize({ version: 'legacy', blocks: [] }).version, '2')
  assert.deepEqual(reads, { currentVersion: 1, versionPolicy: 1, migrations: 1 })

  const sparse = []
  sparse.length = 1
  assert.throws(
    () => new DocumentSchema({ migrations: sparse }),
    /migrations must be a dense array/,
  )
  assert.throws(
    () => new DocumentSchema({ migrations: {} }),
    /migrations must be an array/,
  )
})
