import test from 'node:test'
import assert from 'node:assert/strict'
import { cloneEditorData } from './cloneEditorData.js'
import { mapChecklistTextFields } from './mapTextFields.js'

test('cloneEditorData isolates nested block data before hydration', () => {
  const source = {
    items: [
      { text: 'before', checked: false },
    ],
  }

  const owned = cloneEditorData(source)
  mapChecklistTextFields(owned, text => text.toUpperCase())

  assert.equal(owned.items[0].text, 'BEFORE')
  assert.equal(source.items[0].text, 'before')
})

test('cloneEditorData rejects values that change meaning in JSON', () => {
  assert.throws(() => cloneEditorData({ date: new Date() }), /non-JSON object Date/)
  assert.throws(() => cloneEditorData({ map: new Map() }), /non-JSON object Map/)
  assert.throws(() => cloneEditorData({ value: 1n }), /non-JSON bigint/)
  assert.throws(() => cloneEditorData({ value: undefined }), /non-JSON undefined/)
})

test('cloneEditorData rejects cycles but permits shared JSON subtrees', () => {
  const shared = { value: 1 }
  const cloned = cloneEditorData({ left: shared, right: shared })
  assert.deepEqual(cloned, { left: { value: 1 }, right: { value: 1 } })

  const circular = {}
  circular.self = circular
  assert.throws(() => cloneEditorData(circular), /circular reference/)
})

test('cloneEditorData clones JSON-shaped object and array proxies', () => {
  const objectTarget = { text: 'Vue', nested: { value: 1 } }
  const objectProxy = new Proxy(objectTarget, {})
  const arrayTarget = [objectProxy, { text: 'Rector' }]
  const arrayProxy = new Proxy(arrayTarget, {})

  const clonedObject = cloneEditorData(objectProxy)
  const clonedArray = cloneEditorData(arrayProxy)

  assert.deepEqual(clonedObject, objectTarget)
  assert.deepEqual(clonedArray, [objectTarget, { text: 'Rector' }])
  assert.notStrictEqual(clonedObject, objectTarget)
  assert.notStrictEqual(clonedObject.nested, objectTarget.nested)
  assert.notStrictEqual(clonedArray, arrayTarget)
  assert.notStrictEqual(clonedArray[0], objectTarget)
})
