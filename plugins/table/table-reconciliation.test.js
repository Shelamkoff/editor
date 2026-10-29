import test from 'node:test'
import assert from 'node:assert/strict'
import { plainTextTemplate } from '../../tests/helpers/plainTextTemplate.js'
import { createTablePlugin } from './index.js'

// This DOM adapter intentionally models node identity/moves, not the editor's
// reconciliation rules. Expected heading placement comes from the Table
// authoring contract and v1's positional <th>/<td> rendering.
class FakeElement {
  constructor(tag, ownerDocument) {
    this.ownerDocument = ownerDocument
    this.tagName = tag.toUpperCase()
    this.parentNode = null
    this.children = []
    this.dataset = {}
    this.className = ''
    this.contentEditable = 'inherit'
    this.moveCount = 0
    this.innerHTML = ''
    this.textContent = ''
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
    const index = before === null ? this.children.length : this.children.indexOf(before)
    assert.ok(index >= 0, 'insertBefore reference is not a child')
    child.parentNode = this
    this.children.splice(index, 0, child)
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

const ownerDocument = {
  createElement: tag => tag === 'template'
    ? plainTextTemplate(ownerDocument)
    : new FakeElement(tag, ownerDocument),
}

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

test('Table keeps unchanged mounted row and editable cell stable on sibling text updates', () => {
  const instance = mount(['a', 'b'])
  const field = instance.editableFields()[0].element
  const row = field.parentNode
  const firstCellMoves = field.moveCount
  const firstRowMoves = row.moveCount
  const next = data(['a', 'b'])
  next.rows[1].cells[0].text = 'Updated'
  instance.update(next)
  assert.equal(instance.editableFields()[0].element, field, 'unmodified field element was replaced')
  assert.equal(field.moveCount, firstCellMoves, 'unmodified cell was detached from its row')
  assert.equal(row.moveCount, firstRowMoves, 'unmodified row was detached from the table')
  instance.destroy()
})

test('Table maintains headings and row order through 600 deterministic structural edits', () => {
  let state = 271828183
  const random = limit => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) % limit
  }
  let ids = ['a', 'b', 'c'], headings = true, count = 0
  const instance = mount(ids, headings)
  for (let step = 0; step < 600; step++) {
    const next = [...ids], action = random(6)
    if (action === 0 && next.length < 12) next.splice(random(next.length + 1), 0, 'new-' + count++)
    else if (action === 1 && next.length > 1) next.splice(random(next.length), 1)
    else if (action === 2) next.reverse()
    else if (action === 3 && next.length > 1) next.unshift(next.pop())
    else if (action === 4) headings = !headings
    const before = instance.editableFields().map(field => ({ id: field.key, element: field.element, moves: field.element.moveCount }))
    instance.update(data(next, headings))
    assert.deepEqual(rows(instance), next.map((id, index) => ({
      id, tag: headings && index === 0 ? 'TH' : 'TD',
    })), 'Table DOM heading/order differs from data at step ' + step)
    assert.deepEqual(instance.read().rows.map(row => row.id), next)
    if (action === 5) {
      for (const old of before) {
        const current = instance.editableFields().find(field => field.key === old.id)
        assert.equal(current?.element, old.element, 'no-op update replaced the cell')
        assert.equal(current?.element.moveCount, old.moves, 'no-op update moved the cell')
      }
    }
    ids = next
  }
  instance.destroy()
})
