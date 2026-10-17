import test from 'node:test'
import assert from 'node:assert/strict'
import { createTablePlugin } from './index.js'

// This DOM adapter intentionally models node identity/moves, not the editor's
// reconciliation rules. Expected heading placement comes from the Table
// authoring contract and v1's positional <th>/<td> rendering.
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase()
    this.parentNode = null
    this.children = []
    this.dataset = {}
    this.className = ''
    this.contentEditable = 'inherit'
    this.innerHTML = ''
    this.textContent = ''
  }

  appendChild(child) {
    child.remove()
    child.parentNode = this
    this.children.push(child)
    return child
  }

  replaceWith(next) {
    const parent = this.parentNode
    assert.ok(parent, 'cannot replace an unattached cell')
    const index = parent.children.indexOf(this)
    assert.ok(index >= 0)
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

  get firstChild() { return this.children[0] ?? null }
  focus() {}
}

const ownerDocument = { createElement: tag => new FakeElement(tag) }

function data(ids, withHeadings = true) {
  return {
    withHeadings,
    rows: ids.map(id => ({ id, cells: [{ id: 'cell', text: '' }] })),
  }
}

function mount(ids, withHeadings = true) {
  return createTablePlugin({ injectStyles: false })
    .setup()
    .create(data(ids, withHeadings), { ownerDocument, isReadOnly: () => false })
}

function rows(instance) {
  const table = instance.element.children[0]
  return table.children.map(row => ({
    id: row.dataset.rowId,
    tag: row.children[0]?.tagName,
  }))
}

test('Table moves heading semantics with the first row when author rows are reordered', () => {
  const instance = mount(['a', 'b', 'c'])
  assert.deepEqual(rows(instance), [
    { id: 'a', tag: 'TH' }, { id: 'b', tag: 'TD' }, { id: 'c', tag: 'TD' },
  ])
  instance.update(data(['c', 'a', 'b']))
  assert.deepEqual(rows(instance), [
    { id: 'c', tag: 'TH' }, { id: 'a', tag: 'TD' }, { id: 'b', tag: 'TD' },
  ])
  assert.deepEqual(instance.read().rows.map(row => row.id), ['c', 'a', 'b'])
  instance.destroy()
})

test('Table promotes the surviving row when the former first row is removed', () => {
  const instance = mount(['a', 'b'])
  instance.update(data(['b']))
  assert.deepEqual(rows(instance), [{ id: 'b', tag: 'TH' }])
  assert.deepEqual(instance.editableFields().map(field => field.key), ['cell:b:cell'])
  assert.equal(instance.editableFields()[0].element.tagName, 'TH')
  instance.destroy()
})

test('Table insert-before and no-heading reorder maintain positional semantics', () => {
  const instance = mount(['a', 'b'])
  instance.update(data(['new', 'a', 'b']))
  assert.deepEqual(rows(instance), [
    { id: 'new', tag: 'TH' }, { id: 'a', tag: 'TD' }, { id: 'b', tag: 'TD' },
  ])
  instance.update(data(['a', 'new', 'b'], false))
  assert.deepEqual(rows(instance), [
    { id: 'a', tag: 'TD' }, { id: 'new', tag: 'TD' }, { id: 'b', tag: 'TD' },
  ])
  instance.update(data(['b', 'new', 'a'], true))
  assert.deepEqual(rows(instance), [
    { id: 'b', tag: 'TH' }, { id: 'new', tag: 'TD' }, { id: 'a', tag: 'TD' },
  ])
  instance.destroy()
})
