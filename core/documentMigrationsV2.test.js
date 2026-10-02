import test from 'node:test'
import assert from 'node:assert/strict'

import { migrateV1DocumentToV2 } from './documentMigrationsV2.js'

test('v1 to v2 migration moves paragraph and heading alignment into core tunes without mutating input', () => {
  const source = {
    time: 123,
    version: '1.0.0',
    blocks: [
      {
        id: 'p',
        type: 'paragraph',
        revision: 'r1',
        data: { text: 'body', align: 'center' },
        inline: { w1: { type: 'mention', data: { id: '1', name: 'A' } } },
      },
      {
        id: 'h',
        type: 'heading',
        data: { text: 'title', level: 3, align: 'right' },
        tunes: { textAlign: 'justify', custom: 'keep' },
      },
      {
        id: 'q',
        type: 'quote',
        data: { text: 'quote', caption: '' },
        tunes: { custom: 'keep' },
      },
    ],
  }

  const migrated = migrateV1DocumentToV2(source)

  assert.deepEqual(source.blocks[0].data, { text: 'body', align: 'center' })
  assert.deepEqual(source.blocks[1].data, { text: 'title', level: 3, align: 'right' })

  assert.deepEqual(migrated, {
    time: 123,
    version: '2.0.0',
    blocks: [
      {
        id: 'p',
        type: 'paragraph',
        revision: 'r1',
        data: { text: 'body' },
        tunes: { textAlign: 'center' },
        inline: { w1: { type: 'mention', data: { id: '1', name: 'A' } } },
      },
      {
        id: 'h',
        type: 'heading',
        data: { text: 'title', level: 3 },
        tunes: { textAlign: 'justify', custom: 'keep' },
      },
      {
        id: 'q',
        type: 'quote',
        data: { text: 'quote', caption: '' },
        tunes: { custom: 'keep' },
      },
    ],
  })
  assert.notStrictEqual(migrated, source)
  assert.notStrictEqual(migrated.blocks, source.blocks)
})

test('v1 to v2 migration ignores invalid legacy alignment and removes invalid textAlign tune', () => {
  const migrated = migrateV1DocumentToV2({
    version: '1.0.0',
    blocks: [
      {
        id: 'p',
        type: 'paragraph',
        data: { text: 'body', align: 'diagonal' },
        tunes: { textAlign: 'expression(alert(1))', custom: 1 },
      },
      {
        id: 'h',
        type: 'heading',
        data: { text: 'title', level: 2, align: 'left' },
        tunes: { textAlign: 'bad' },
      },
    ],
  })

  assert.deepEqual(migrated.blocks[0], {
    id: 'p',
    type: 'paragraph',
    data: { text: 'body' },
    tunes: { custom: 1 },
  })
  assert.deepEqual(migrated.blocks[1], {
    id: 'h',
    type: 'heading',
    data: { text: 'title', level: 2 },
    tunes: { textAlign: 'left' },
  })
})

test('v1 to v2 migration only interprets alignment for paragraph and heading blocks', () => {
  const source = {
    version: '1.0.0',
    blocks: [
      {
        id: 'custom',
        type: 'custom',
        data: { align: 'center', payload: true },
        tunes: { textAlign: 'center' },
      },
      null,
      'opaque',
    ],
  }

  const migrated = migrateV1DocumentToV2(source)
  assert.deepEqual(migrated, {
    version: '2.0.0',
    blocks: [
      {
        id: 'custom',
        type: 'custom',
        data: { align: 'center', payload: true },
        tunes: { textAlign: 'center' },
      },
      null,
      'opaque',
    ],
  })
})
