import test from 'node:test'
import assert from 'node:assert/strict'
import { createPersonPlugin } from './index.js'

// Minimal DOM ownership fixture. The tests concern whether update() moves a
// mounted editing host, not browser parsing or rich-text sanitation. Empty
// author text keeps the real sanitizer's inert template path unnecessary.
class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.dataset = {}
    this.attributes = {}
    this.style = {}
    this.className = ''
    this.contentEditable = 'inherit'
    this._text = ''
    this._html = ''
    this.classList = { add() {}, remove() {}, toggle() {} }
    this.listeners = new Map()
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join('') }
  set textContent(value) { this.replaceChildren(); this._text = String(value); this._html = String(value) }
  get innerHTML() { return this._html || this.children.map(child => child.textContent).join('') }
  set innerHTML(value) { this.replaceChildren(); this._html = String(value); this._text = String(value) }
  get firstChild() { return this.children[0] ?? null }

  appendChild(child) {
    child.remove()
    child.parentNode = this
    this.children.push(child)
    return child
  }
  append(...children) { for (const child of children) this.appendChild(child) }
  replaceChildren(...children) {
    if (this.ownerDocument.activeElement && this.contains(this.ownerDocument.activeElement)
      && this.ownerDocument.activeElement !== this) {
      this.ownerDocument.activeElement = null
    }
    for (const child of this.children) child.parentNode = null
    this.children = []
    for (const child of children) this.appendChild(child)
  }
  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.children
    const index = siblings.indexOf(this)
    if (index >= 0) siblings.splice(index, 1)
    this.parentNode = null
  }
  contains(target) {
    for (let node = target; node; node = node.parentNode) if (node === this) return true
    return false
  }
  focus() { this.ownerDocument.activeElement = this }
  addEventListener(type, listener) {
    const group = this.listeners.get(type) ?? []
    group.push(listener)
    this.listeners.set(type, group)
  }
  dispatch(type) { for (const listener of this.listeners.get(type) ?? []) listener({ type, target: this }) }
  setAttribute(name, value) { this.attributes[name] = String(value) }
  getAttribute(name) {
    if (name === 'data-person-id') return this.dataset.personId ?? null
    return this.attributes[name] ?? null
  }
  matches(selector) {
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1))
    return selector === 'input[data-link-id]' && this.tagName === 'INPUT' && !!this.dataset.linkId
  }
  querySelectorAll(selector) {
    const result = []
    const visit = parent => {
      for (const child of parent.children) {
        if (child.matches(selector)) result.push(child)
        visit(child)
      }
    }
    visit(this)
    return result
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
}
const person = id => ({ id, name: '', role: '', bio: '', avatar: '', links: [] })
const input = () => ({ persons: [person('a'), person('b')] })
function mount(initial = input()) {
  const ownerDocument = {
    activeElement: null,
    createElement(tag) { return new FakeElement(tag, ownerDocument) },
  }
  const definition = createPersonPlugin({ injectStyles: false })
  const instance = definition.setup({ t: (_key, fallback) => fallback }).create(initial, {
    ownerDocument,
    isReadOnly: () => false,
    signal: new AbortController().signal,
    getData: () => initial,
  })
  return { instance, ownerDocument }
}
function nameField(instance, id) {
  return instance.editableFields().find(field => field.key === 'person:' + id + ':name')?.element
}
test('Person retains active editing host when another person changes', () => {
  const { instance, ownerDocument } = mount()
  const field = nameField(instance, 'a')
  field.focus()
  const next = input()
  next.persons[1].role = 'Editor'
  instance.update(next)
  assert.equal(nameField(instance, 'a'), field, 'unrelated update replaced the active author field')
  assert.equal(ownerDocument.activeElement, field, 'unrelated update blurred the author field')
  assert.equal(instance.read().persons[1].role, 'Editor')
  instance.destroy()
})
test('Person retains active editing host after tabs are reordered', () => {
  const { instance, ownerDocument } = mount()
  const field = nameField(instance, 'a')
  field.focus()
  const next = input()
  next.persons.reverse()
  instance.update(next)
  assert.equal(nameField(instance, 'a'), field)
  assert.equal(ownerDocument.activeElement, field)
  assert.deepEqual(instance.read().persons.map(item => item.id), ['b', 'a'])
  instance.destroy()
})
test('Person replaces active author fields when the active person is removed', () => {
  const { instance } = mount()
  const before = nameField(instance, 'a')
  instance.update({ persons: [person('b')] })
  const next = nameField(instance, 'b')
  assert.ok(next && next !== before)
  assert.deepEqual(instance.editableFields().map(field => field.key), [
    'person:b:name', 'person:b:role', 'person:b:bio',
  ])
  assert.deepEqual(instance.read().persons.map(item => item.id), ['b'])
  instance.destroy()
})

test('Person current name input updates the tab created by a sibling change', () => {
  const { instance } = mount()
  const field = nameField(instance, 'a')
  const next = input()
  next.persons[1].role = 'New role'
  instance.update(next)
  assert.equal(nameField(instance, 'a'), field, 'the editing host must remain mounted')
  field.textContent = 'Changed name'
  field.dispatch('input')
  const tabs = instance.element.children[0]
  const current = tabs.children.find(item => item.dataset.personId === 'a')
  const label = current.querySelector('.oe-person__tab-label')
  assert.equal(label.textContent, 'Changed name', 'typing updated a stale detached tab label')
  instance.destroy()
})


test('Person preserves its active editor through 400 deterministic unrelated changes', () => {
  const { instance, ownerDocument } = mount()
  const field = nameField(instance, 'a')
  field.focus()
  let current = input()
  let randomSeed = 938475
  const random = max => {
    randomSeed ^= randomSeed << 13
    randomSeed ^= randomSeed >>> 17
    randomSeed ^= randomSeed << 5
    return (randomSeed >>> 0) % max
  }
  for (let step = 0; step < 400; step++) {
    const next = { persons: current.persons.map(person => ({
      ...person, links: person.links.map(link => ({ ...link })),
    })) }
    const action = random(4)
    if (action === 0) next.persons.reverse()
    else if (action === 1) {
      next.persons = next.persons.map(person => person.id === 'b'
        ? { ...person, role: person.role === '' ? 'Editor' : '' } : person)
    } else if (action === 2 && !next.persons.some(person => person.id === 'c')) {
      next.persons.push(person('c'))
    } else if (action === 3 && next.persons.some(person => person.id === 'c')) {
      next.persons = next.persons.filter(person => person.id !== 'c')
    }
    instance.update(next)
    assert.equal(nameField(instance, 'a'), field, 'active field replaced at step ' + step)
    assert.equal(ownerDocument.activeElement, field, 'active field blurred at step ' + step)
    assert.deepEqual(instance.read().persons.map(person => person.id),
      next.persons.map(person => person.id), 'author order drift at step ' + step)
    current = next
  }
  instance.destroy()
})
