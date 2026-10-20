import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareCurrentDocument } from './DocumentIngestion.js'
import { createVersionedDataSchema } from '../shared/versionedDataSchema.js'

function harness(normalizeData, normalizeTunes = value => value) {
  const definition = {
    type: 'custom',
    schema: {
      currentVersion: 1,
      decode(input) { return { dataVersion: 1, data: input.data } },
    },
  }
  return {
    defaultBlockType: 'custom',
    getBlockDefinition: type => type === 'custom' ? definition : undefined,
    getInlineDefinition: () => undefined,
    normalizeData: (_definition, value) => ({ dataVersion: 1, data: normalizeData(value) }),
    normalizeTunes,
    createBlockId: () => 'new',
    assembleRecord: () => { throw new Error('No new block should be assembled') },
  }
}

const base = () => ({
  version: '2.0.0',
  blocks: [{
    id: 'a', type: 'custom', dataVersion: 1, revision: 'producer-revision',
    data: { nested: { first: 1, second: 2 }, list: [{ a: 1, b: 2 }] },
    tunes: { first: true, second: false },
  }],
})

test('canonical document ingestion retains revision for semantic JSON object reordering', () => {
  const document = base()
  const services = harness(data => ({
    list: data.list.map(item => ({ b: item.b, a: item.a })),
    nested: { second: data.nested.second, first: data.nested.first },
  }), tunes => ({ second: tunes.second, first: tunes.first }))
  const result = prepareCurrentDocument(document, services)
  assert.equal(result.blocks[0].revision, 'producer-revision',
    'normalization reordered JSON object keys and invalidated a semantically identical revision')
  assert.deepEqual(result.blocks[0].data, {
    list: [{ b: 2, a: 1 }],
    nested: { second: 2, first: 1 },
  })
})

test('canonical document ingestion invalidates revisions for meaningful nested edits', () => {
  const document = base()
  const services = harness(data => ({
    ...data,
    nested: { ...data.nested, second: 9 },
  }))
  const result = prepareCurrentDocument(document, services)
  assert.equal(Object.hasOwn(result.blocks[0], 'revision'), false)
})

test('canonical document ingestion invalidates revisions when an array is reordered', () => {
  const document = base()
  document.blocks[0].data.list.push({ a: 3, b: 4 })
  const services = harness(data => ({
    ...data,
    list: [...data.list].reverse(),
  }))
  const result = prepareCurrentDocument(document, services)
  assert.equal(Object.hasOwn(result.blocks[0], 'revision'), false)
})


test('document ingestion rejects an async text normalizer even when the block mapper ignores its result', () => {
  const schema = createVersionedDataSchema({
    currentVersion: 1,
    createDefault: () => ({ text: '' }),
    normalize: data => ({ text: data.text }),
    mapRichText(data, transform) {
      transform(data.text, 'text')
    },
  })
  const definition = { type: 'custom', schema }
  const services = {
    getBlockDefinition: type => type === 'custom' ? definition : undefined,
    getInlineDefinition: () => undefined,
    normalizeData: (_definition, data) => schema.encode(
      schema.mapRichText(data, () => Promise.resolve('<b>late</b>')),
    ),
    normalizeTunes: value => value,
  }
  const document = {
    version: '2.0.0',
    blocks: [{ id: 'a', type: 'custom', dataVersion: 1, data: { text: 'Original' } }],
  }
  assert.throws(() => prepareCurrentDocument(document, services), /must complete synchronously/)
})
