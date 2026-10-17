import test from 'node:test'
import assert from 'node:assert/strict'
import { createColumnsPlugin } from './index.js'

// Element-tree fixture tracks native reparenting. Moving an already-mounted
// contenteditable is observable: browser selection/caret can be lost.
class FakeElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.dataset = {}
    this.style = {}
    this.className = ''
    this.contentEditable = 'inherit'
    this.innerHTML = ''
    this.textContent = ''
    this.moveCount = 0
    this.classList = { toggle() {} }
  }

  appendChild(child) {
    if (child.parentNode) child.moveCount++
    child.remove()
    child.parentNode = this
    this.children.push(child)
    return child
  }

  append(...children) {
    for (const child of children) this.appendChild(child)
  }

  insertBefore(child, before) {
    if (child === before) return child
    if (child.parentNode) child.moveCount++
    child.remove()
    const position = before == null ? this.children.length : this.children.indexOf(before)
    assert.ok(position >= 0, 'insertBefore reference is not a child')
    child.parentNode = this
    this.children.splice(position, 0, child)
    return child
  }

  remove() {
    if (!this.parentNode) return
    const index = this.parentNode.children.indexOf(this)
    if (index >= 0) this.parentNode.children.splice(index, 1)
    this.parentNode = null
  }

  addEventListener() {}
  setAttribute() {}
  focus() {}
}

const ownerDocument = { createElement(tag) { return new FakeElement(tag, ownerDocument) } }
const values = (ids, layout = '1-1') => ({
  layout,
  columns: ids.map(id => ({ id, content: '' })),
})
const make = (ids = ['left', 'right'], layout = '1-1') =>
  createColumnsPlugin({ injectStyles: false }).setup({
    t: (_key, fallback) => fallback,
  }).create(values(ids, layout), {
    ownerDocument,
    isReadOnly: () => false,
    signal: new AbortController().signal,
  })

const grid = instance => instance.element.children[0]
const order = instance => grid(instance).children.map(node => node.dataset.columnId)

test('Columns keeps editing hosts attached across identical and layout-only updates', () => {
  const instance = make()
  const original = instance.editableFields().map(item => item.element)
  const counts = original.map(item => item.moveCount)
  instance.update(values(['left', 'right']))
  instance.update(values(['left', 'right'], '1-2'))
  assert.deepEqual(instance.editableFields().map(item => item.element), original)
  assert.deepEqual(original.map(item => item.moveCount), counts, 'layout change moved native editing hosts')
  assert.deepEqual(order(instance), ['left', 'right'])
  assert.equal(instance.read().layout, '1-2')
  instance.destroy()
})

test('Columns reorders existing columns but does not move nodes on a later no-op update', () => {
  const instance = make()
  const original = instance.editableFields().map(item => item.element)
  instance.update(values(['right', 'left']))
  assert.deepEqual(order(instance), ['right', 'left'])
  assert.deepEqual(instance.editableFields().map(item => item.element), [original[1], original[0]])
  const counts = original.map(item => item.moveCount)
  instance.update(values(['right', 'left']))
  assert.deepEqual(original.map(item => item.moveCount), counts)
  instance.destroy()
})

test('Columns retains existing fields while growing and shrinking the layout', () => {
  const instance = make()
  const original = instance.editableFields().map(item => item.element)
  instance.update(values(['left', 'right', 'third'], '1-1-1'))
  assert.deepEqual(order(instance), ['left', 'right', 'third'])
  assert.equal(instance.editableFields()[0].element, original[0])
  assert.equal(instance.editableFields()[1].element, original[1])
  instance.update(values(['left', 'right']))
  assert.deepEqual(order(instance), ['left', 'right'])
  assert.equal(instance.editableFields()[0].element, original[0])
  assert.equal(instance.editableFields()[1].element, original[1])
  instance.destroy()
})
