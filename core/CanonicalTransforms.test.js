import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assembleCanonicalRecord,
  createSessionIdAllocator,
  captureDocumentView,
  canonicalRecordsEqual,
  remapCanonicalInline,
  remapCanonicalFragment,
  prepareCanonicalInlineMerge,
} from './CanonicalTransforms.js'

test('captured views retain immutable references/order and never traverse unrelated payloads', () => {
  let reads=0,lookups=0
  const first=Object.freeze({id:'a',get data(){reads++;throw new Error('Payload must remain unobserved')}})
  const second=Object.freeze({id:'b'})
  const records=new Map([['a',first],['b',second]])
  const order=['a','b']
  const view=captureDocumentView({ids:()=>order,peek:id=>{lookups++;return records.get(id)}})
  records.set('a',Object.freeze({id:'a',data:{text:'Later'}}))
  order.reverse()
  assert.deepEqual(view.ids,['a','b'])
  assert.equal(Object.isFrozen(view.ids),true)
  assert.equal(view.peek('a'),first)
  assert.equal(view.peek('a'),first)
  assert.equal(reads,0)
  assert.equal(lookups,2)
  assert.deepEqual([...view.references()],[['a',first]])
})

test('session allocator never reuses emitted ids and respects reserved ids', () => {
  const values=['a','a','blocked','b','a','c']
  let index=0
  const allocate=createSessionIdAllocator(() => values[index++])
  const reserved=new Set(['blocked'])

  assert.equal(allocate('item'), 'a')
  assert.equal(allocate('item', reserved), 'b')
  assert.equal(reserved.has('b'), true)
  assert.equal(allocate('item'), 'c')
  assert.equal(index, 6)
})

test('canonical record assembly owns current data/tunes and never carries producer revision', () => {
  const definition={schema:{}}
  const source={text:' source '}
  const record=assembleCanonicalRecord({
    id:'a',
    type:'probe',
    definition,
    data:source,
    tunes:{textAlign:'center'},
    inlineSource:undefined,
    ownerDocument:undefined,
    normalizeData(_definition,data){
      return {dataVersion:3,data:{text:String(data.text).trim()}}
    },
    normalizeTunes(tunes){
      return tunes?{...tunes}:undefined
    },
  })

  assert.deepEqual(record,{
    id:'a',
    type:'probe',
    dataVersion:3,
    data:{text:'source'},
    tunes:{textAlign:'center'},
  })
  assert.deepEqual(source,{text:' source '})
  assert.equal(Object.hasOwn(record,'revision'),false)
})

test('JSON object key order does not create an authored edit or phantom revision', () => {
  const dataA = JSON.parse('{"a":1,"nested":{"x":2,"y":3},"list":[{"p":1,"q":2}]}')
  const dataB = JSON.parse('{"list":[{"q":2,"p":1}],"nested":{"y":3,"x":2},"a":1}')
  const inlineA = JSON.parse('{"__proto__":{"type":"mention","dataVersion":1,"data":{"id":"1","name":"Ada"}}}')
  const inlineB = JSON.parse('{"__proto__":{"data":{"name":"Ada","id":"1"},"dataVersion":1,"type":"mention"}}')
  const left = { id: 'a', type: 'custom', dataVersion: 1, data: dataA, tunes: { textAlign: 'center' }, inline: inlineA, revision: 10 }
  const right = { id: 'a', type: 'custom', dataVersion: 1, data: dataB, tunes: { textAlign: 'center' }, inline: inlineB, revision: 11 }
  assert.equal(canonicalRecordsEqual(left, right), true)
  assert.equal(canonicalRecordsEqual(right, left), true)
})

test('canonical equality still recognizes array order and genuine content changes', () => {
  const record = data => ({ id: 'a', type: 'custom', dataVersion: 1, data })
  assert.equal(canonicalRecordsEqual(record({ items: [1, 2] }), record({ items: [2, 1] })), false)
  assert.equal(canonicalRecordsEqual(record({ count: 1 }), record({ count: 2 })), false)
  assert.equal(canonicalRecordsEqual(record({ a: 1 }), record({ a: 1, b: null })), false)
  assert.equal(canonicalRecordsEqual(record({ items: [{ x: 1 }] }), record({ items: [{ x: 1 }] })), true)
  assert.equal(canonicalRecordsEqual({ ...record({}), type: 'first' }, { ...record({}), type: 'second' }), false)
})


test('inline remapping rejects collisions with an existing sidecar instead of losing payloads', () => {
  const sidecar = {
    first: { type: 'mention', dataVersion: 1, data: { text: 'Ada' } },
    second: { type: 'mention', dataVersion: 1, data: { text: 'Bob' } },
  }
  assert.throws(
    () => remapCanonicalInline(sidecar, new Map([['first', 'second']])),
    /collision|duplicate/i,
  )
  assert.deepEqual(sidecar.first.data, { text: 'Ada' })
  assert.deepEqual(sidecar.second.data, { text: 'Bob' })
})

test('inline remapping rejects two-to-one destination IDs before reading author payload getters', () => {
  let reads = 0
  const sidecar = { second: { type: 'mention', dataVersion: 1, data: { text: 'Bob' } } }
  Object.defineProperty(sidecar, 'first', {
    enumerable: true,
    get() {
      reads++
      throw new Error('colliding payload was needlessly inspected')
    },
  })
  assert.throws(
    () => remapCanonicalInline(sidecar, new Map([['first', 'same'], ['second', 'same']])),
    /collision|duplicate/i,
  )
  assert.equal(reads, 0, 'a rejected ID remap inspected payload data before validating ownership')
})

test('inline remapping rejects destination IDs that cannot occur in canonical placeholders', () => {
  const sidecar = { first: { type: 'mention', dataVersion: 1, data: { text: 'Ada' } } }
  for (const invalid of ['', 'bad/id', 'two words', 17, null]) {
    assert.throws(
      () => remapCanonicalInline(sidecar, new Map([['first', invalid]])),
      /inline.*id|inline.*reference|destination/i,
      String(invalid),
    )
  }
})

test('inline remapping still supports one-to-one ID swaps and preserves detached payloads', () => {
  const left = { type: 'mention', dataVersion: 1, data: { text: 'Ada' } }
  const right = { type: 'mention', dataVersion: 1, data: { text: 'Bob' } }
  const sidecar = { first: left, second: right }
  const result = remapCanonicalInline(
    sidecar, new Map([['first', 'second'], ['second', 'first']]),
  )
  assert.deepEqual(result, { second: left, first: right })
  assert.notStrictEqual(result.second, left)
  assert.notStrictEqual(result.first, right)
  result.second.data.text = 'changed'
  assert.equal(sidecar.first.data.text, 'Ada')
})


/** Minimal owning-document contract for canonical plain-text rich fields.
 * Deliberately no HTML parser, markup fixtures, or synthetic rich DOM: the
 * tests below use the actual shared rich-text scan and remap functions on
 * plain text nodes only.
 */
function plainTextOwnerDocument() {
  return {
    createElement(tag) {
      if (tag !== 'template') throw new Error('Unexpected DOM element: ' + tag)
      const text = { nodeType: 3, data: '', nextSibling: null, parentElement: null }
      const content = {
        childNodes: [text],
        firstChild: text,
        querySelectorAll() { return [] },
      }
      return {
        content,
        get innerHTML() { return text.data },
        set innerHTML(value) { text.data = String(value) },
      }
    },
    createTreeWalker(root) {
      let index = 0
      return {
        nextNode() {
          while (index < root.childNodes.length) {
            const candidate = root.childNodes[index++]
            if (candidate.nodeType === 3) return candidate
          }
          return null
        },
      }
    },
  }
}

test('clipboard remap excludes unreferenced sidecar entries that could overwrite a target widget', () => {
  const ownerDocument = plainTextOwnerDocument()
  const existing = { type: 'mention', dataVersion: 1, data: { name: 'Existing' } }
  const imported = { type: 'mention', dataVersion: 1, data: { name: 'Unrelated' } }
  const result = remapCanonicalFragment({
    html: 'Copied ordinary text',
    inline: { shared: imported },
    reservedIds: new Set(['shared']),
    ownerDocument,
    allocateInlineId() { throw new Error('no visible widget requires a remap') },
  })
  assert.equal(result.html, 'Copied ordinary text')
  assert.deepEqual(result.inline, {})
  const merged = { shared: existing, ...result.inline }
  assert.deepEqual(merged.shared, existing,
    'an unrelated copied sidecar replaced the existing inline widget')
})

test('clipboard remap carries only referenced inline payloads while safely renaming a collision', () => {
  const ownerDocument = plainTextOwnerDocument()
  const visible = { type: 'mention', dataVersion: 1, data: { name: 'Copied' } }
  const stale = { type: 'mention', dataVersion: 1, data: { name: 'Stale' } }
  const result = remapCanonicalFragment({
    html: '{{shared}}',
    inline: { shared: visible, stale },
    reservedIds: new Set(['shared']),
    ownerDocument,
    allocateInlineId(reserved) {
      reserved.add('copied-1')
      return 'copied-1'
    },
  })
  assert.equal(result.html, '{{copied-1}}')
  assert.deepEqual(result.inline, { 'copied-1': visible })
  assert.equal(Object.hasOwn(result.inline, 'stale'), false)
  assert.notStrictEqual(result.inline['copied-1'], visible)
})

test('fragment remap rejects a duplicate id returned by the allocator instead of stealing target data', () => {
  const ownerDocument = plainTextOwnerDocument()
  const visible = { type: 'mention', dataVersion: 1, data: { name: 'Copied' } }
  assert.throws(() => remapCanonicalFragment({
    html: '{{shared}}',
    inline: { shared: visible },
    reservedIds: new Set(['shared']),
    ownerDocument,
    allocateInlineId() { return 'shared' },
  }), /collis|reserved|unique/i)
})

test('inline merge rejects a duplicate allocator id rather than collapsing two widget payloads', () => {
  const ownerDocument = plainTextOwnerDocument()
  const definition = {
    schema: {
      mapRichText(data, transform) {
        return { text: transform(data.text, 'text') }
      },
    },
  }
  const target = {
    data: { text: '{{shared}}' },
    inline: { shared: { type: 'mention', dataVersion: 1, data: { name: 'Left' } } },
  }
  const source = {
    data: { text: '{{shared}}' },
    inline: { shared: { type: 'mention', dataVersion: 1, data: { name: 'Right' } } },
  }
  assert.throws(
    () => prepareCanonicalInlineMerge({
      definition, target, source, ownerDocument,
      allocateInlineId() { return 'shared' },
    }),
    /collis|reserved|unique/i,
  )
})

test('valid inline merge remaps only the conflicting source and preserves both payloads', () => {
  const ownerDocument = plainTextOwnerDocument()
  const definition = {
    schema: {
      mapRichText(data, transform) { return { text: transform(data.text, 'text') } },
    },
  }
  const target = {
    data: { text: '{{shared}}' },
    inline: { shared: { type: 'mention', dataVersion: 1, data: { name: 'Left' } } },
  }
  const source = {
    data: { text: '{{shared}}' },
    inline: { shared: { type: 'mention', dataVersion: 1, data: { name: 'Right' } } },
  }
  const result = prepareCanonicalInlineMerge({
    definition, target, source, ownerDocument,
    allocateInlineId(reserved) {
      assert.equal(reserved.has('shared'), true)
      // The real session allocator reserves its result before returning.
      reserved.add('copy-1')
      return 'copy-1'
    },
  })
  assert.deepEqual(result.targetData, { text: '{{shared}}' })
  assert.deepEqual(result.sourceData, { text: '{{copy-1}}' })
  assert.deepEqual(result.inline, { shared: target.inline.shared, 'copy-1': source.inline.shared })
})


test('fragment remap rejects a generated id that cannot be parsed as an inline reference', () => {
  const ownerDocument = plainTextOwnerDocument()
  const inline = { shared: { type: 'mention', dataVersion: 1, data: { name: 'Copied' } } }
  for (const invalid of ['', 'not/a/reference', 'two words']) {
    assert.throws(() => remapCanonicalFragment({
      html: '{{shared}}',
      inline,
      reservedIds: new Set(['shared']),
      ownerDocument,
      allocateInlineId() { return invalid },
    }), /inline reference destination id/i)
  }
})
