import test from 'node:test'
import assert from 'node:assert/strict'
import { plainTextTemplate } from '../../tests/helpers/plainTextTemplate.js'
import { createListPlugin } from './index.js'

// Track actual DOM moves: removing/reappending a focused contenteditable node
// collapses the native selection in Chromium. The fixture does not implement
// reconciliation; it only enforces basic Element tree semantics.
class FakeElement {
  constructor(tag, ownerDocument) {
    this.ownerDocument = ownerDocument
    this.tagName = tag.toUpperCase()
    this.children = []
    this.parentNode = null
    this.className = ''
    this.dataset = {}
    this.contentEditable = 'inherit'
    this.innerHTML = ''
    this.textContent = ''
    this.moveCount = 0
  }
  appendChild(child) {
    if (child.parentNode) child.moveCount++
    child.remove()
    child.parentNode = this
    this.children.push(child)
    return child
  }
  insertBefore(child, before) {
    if (child === before) return child
    if (child.parentNode) child.moveCount++
    child.remove()
    const index = before == null ? this.children.length : this.children.indexOf(before)
    assert.ok(index >= 0, 'invalid sibling for insertBefore')
    child.parentNode = this
    this.children.splice(index, 0, child)
    return child
  }
  replaceWith(next) {
    const parent = this.parentNode
    assert.ok(parent)
    const index = parent.children.indexOf(this)
    next.remove()
    next.parentNode = parent
    parent.children.splice(index, 1, next)
    this.parentNode = null
  }
  remove() {
    if (!this.parentNode) return
    const index = this.parentNode.children.indexOf(this)
    if (index >= 0) this.parentNode.children.splice(index, 1)
    this.parentNode = null
  }
  focus() {}
}

const ownerDocument = {
  createElement: tag => tag === 'template'
    ? plainTextTemplate(ownerDocument)
    : new FakeElement(tag, ownerDocument),
}
const items = ids => ({ style: 'unordered', items: ids.map(id => ({ id, text: '' })) })
function mount(ids) {
  return createListPlugin({ injectStyles: false }).setup().create(items(ids), {
    ownerDocument, isReadOnly: () => false,
  })
}
const idsOf = instance => instance.element.children[0].children.map(item => item.dataset.itemId)

test('List keeps unchanged mounted editable nodes stable on sibling updates', () => {
  const instance = mount(['a', 'b', 'c'])
  const second = instance.editableFields()[1].element
  const originalMoves = second.moveCount
  const next = items(['a', 'b', 'c'])
  next.items[0].text = 'Updated'
  instance.update(next)
  assert.equal(instance.editableFields()[1].element, second)
  assert.equal(second.moveCount, originalMoves, 'unmodified contenteditable was moved')
  assert.deepEqual(idsOf(instance), ['a', 'b', 'c'])
  instance.destroy()
})

test('List preserves positional order across insert, remove and reorder', () => {
  const instance = mount(['a', 'b', 'c'])
  instance.update(items(['c', 'new', 'a']))
  assert.deepEqual(idsOf(instance), ['c', 'new', 'a'])
  instance.update(items(['a', 'c']))
  assert.deepEqual(idsOf(instance), ['a', 'c'])
  assert.deepEqual(instance.read().items.map(item => item.id), ['a', 'c'])
  instance.destroy()
})

test('List does not move a field on a semantically identical update', () => {
  const instance = mount(['a', 'b'])
  const fields = instance.editableFields()
  const beforeMoves = fields.map(field => field.element.moveCount)
  instance.update(items(['a', 'b']))
  assert.deepEqual(instance.editableFields().map(field => field.element.moveCount), beforeMoves)
  instance.destroy()
})

test('List matches an independent row-order oracle through 600 deterministic edits', () => {
  let state = 314159265
  const random = limit => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) % limit
  }
  const instance = mount(['a', 'b', 'c'])
  let ids = ['a', 'b', 'c'], count = 0
  for (let step = 0; step < 600; step++) {
    const next = [...ids], action = random(5)
    if (action === 0 && next.length < 12) next.splice(random(next.length + 1), 0, 'new-' + count++)
    else if (action === 1 && next.length > 1) next.splice(random(next.length), 1)
    else if (action === 2) next.reverse()
    else if (action === 3 && next.length > 1) next.push(next.shift())
    const before = instance.editableFields().map(field => ({ id: field.key, element: field.element, moves: field.element.moveCount }))
    instance.update(items(next))
    assert.deepEqual(idsOf(instance), next, 'List DOM order differs from authored data at step ' + step)
    assert.deepEqual(instance.read().items.map(item => item.id), next)
    assert.deepEqual(instance.editableFields().map(field => field.key), next.map(id => 'item:' + id))
    if (action === 4) {
      for (const old of before) {
        const current = instance.editableFields().find(field => field.key === old.id)
        assert.equal(current?.element, old.element, 'no-op update replaced the editable')
        assert.equal(current?.element.moveCount, old.moves, 'no-op update moved the editable')
      }
    }
    ids = next
  }
  instance.destroy()
})
