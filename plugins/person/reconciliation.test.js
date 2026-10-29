import test from 'node:test'
import assert from 'node:assert/strict'
import { plainTextTemplate } from '../../tests/helpers/plainTextTemplate.js'
import { createPersonPlugin } from './index.js'

// Minimal DOM ownership fixture. The tests concern whether update() moves a
// mounted editing host, not browser parsing or rich-text sanitation. The
// template adapter accepts only plain author text; markup is tested in Chromium.
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
  addEventListener(type, listener, options = {}) {
    if (options.signal?.aborted) return
    const group = this.listeners.get(type) ?? []
    group.push(listener)
    this.listeners.set(type, group)
    options.signal?.addEventListener('abort', () => {
      const current = this.listeners.get(type) ?? []
      const index = current.indexOf(listener)
      if (index >= 0) current.splice(index, 1)
    }, { once: true })
  }
  dispatch(type, details = {}) {
    const event = {
      type, target: this, defaultPrevented: false,
      stopPropagation() {},
      preventDefault() { this.defaultPrevented = true },
      ...details,
    }
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
    return event
  }
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
  let canonical = initial
  const ownerDocument = {
    activeElement: null,
    createElement(tag) {
      return tag === 'template' ? plainTextTemplate(ownerDocument) : new FakeElement(tag, ownerDocument)
    },
  }
  const definition = createPersonPlugin({ injectStyles: false })
  const instance = definition.setup({ t: (_key, fallback) => fallback }).create(initial, {
    ownerDocument,
    isReadOnly: () => false,
    signal: new AbortController().signal,
    getData: () => canonical,
    commitDomMutation() {},
  })
  return { instance, ownerDocument, setCanonicalData(next) { canonical = next } }
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
  instance.update(next, input())
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
  instance.update(next, input())
  assert.equal(nameField(instance, 'a'), field)
  assert.equal(ownerDocument.activeElement, field)
  assert.deepEqual(instance.read().persons.map(item => item.id), ['b', 'a'])
  instance.destroy()
})
test('Person replaces active author fields when the active person is removed', () => {
  const { instance } = mount()
  const before = nameField(instance, 'a')
  instance.update({ persons: [person('b')] }, input())
  const next = nameField(instance, 'b')
  assert.ok(next && next !== before)
  assert.deepEqual(instance.editableFields().map(field => field.key), [
    'person:b:name', 'person:b:role', 'person:b:bio',
  ])
  assert.deepEqual(instance.read().persons.map(item => item.id), ['b'])
  instance.destroy()
})

test('Person current name completion updates the tab created by a sibling change', () => {
  const initial = input()
  initial.persons[0].name = 'Original name'
  const { instance } = mount(initial)
  const descriptor = instance.editableFields().find(field => field.key === 'person:a:name')
  const field = descriptor.element, complete = instance.afterProjection
  const tabs = instance.element.children[0]
  const oldTab = tabs.children.find(item => item.dataset.personId === 'a')
  const oldLabel = oldTab.querySelector('.oe-person__tab-label')
  const next = structuredClone(initial)
  next.persons[1].role = 'New role'
  instance.update(next, initial)
  assert.equal(nameField(instance, 'a'), field, 'the editing host must remain mounted')
  const current = tabs.children.find(item => item.dataset.personId === 'a')
  const label = current.querySelector('.oe-person__tab-label')
  assert.notEqual(current, oldTab, 'the sibling update must actually replace the tab projection')
  assert.equal(oldTab.parentNode, null)
  field.textContent = 'Changed name'
  assert.equal(label.textContent, 'Original name', 'uncommitted author DOM cannot complete its label')
  Reflect.apply(complete, instance, [descriptor])
  assert.equal(label.textContent, 'Changed name', 'completion updated a stale detached tab label')
  assert.equal(oldLabel.textContent, 'Original name', 'completion wrote into the retired tab projection')
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
    instance.update(next, current)
    assert.equal(nameField(instance, 'a'), field, 'active field replaced at step ' + step)
    assert.equal(ownerDocument.activeElement, field, 'active field blurred at step ' + step)
    assert.deepEqual(instance.read().persons.map(person => person.id),
      next.persons.map(person => person.id), 'author order drift at step ' + step)
    current = next
  }
  instance.destroy()
})

test('retired Person tab cannot change active record after a sibling update', () => {
  const { instance } = mount()
  const tabs = instance.element.children[0]
  const retiredTab = tabs.children.find(item => item.dataset.personId === 'b')
  const retiredButton = retiredTab.children[0]
  const next = input()
  next.persons[1].role = 'Writer'
  instance.update(next, input())
  assert.notEqual(tabs.children.find(item => item.dataset.personId === 'b'), retiredTab)
  assert.equal(retiredButton.listeners.get('click')?.length ?? 0, 0,
    'retired tab still owns a live click listener')
  retiredButton.dispatch('click')
  assert.equal(nameField(instance, 'a')?.parentNode !== null, true,
    'retired tab redirected the active Person editing host')
  assert.equal(instance.editableFields()[0]?.key, 'person:a:name')
  instance.destroy()
})

test('Person retires body event listeners only when the active record actually changes', () => {
  const initial = input()
  for (const person of initial.persons) person.links.push({
    id: 'site', type: 'website', url: 'https://example.com/' + person.id,
  })
  const { instance } = mount(initial)
  const name = nameField(instance, 'a')
  const urlField = id => instance.editableFields().find(field => field.key === 'person:' + id + ':link:site:url')?.element
  const url = urlField('a'), icon = url.parentNode.querySelector('.oe-person__link-icon')
  const assertLiveControl = control => {
    assert.equal(control.dispatch('keydown', { key: 'Enter' }).defaultPrevented, true,
      'the current URL control lost its single-line keyboard behavior')
    const currentIcon = control.parentNode.querySelector('.oe-person__link-icon')
    currentIcon.innerHTML = 'pending icon'
    control.dispatch('input')
    assert.equal(currentIcon.innerHTML, 'pending icon', 'a direct URL listener bypassed the projection read owner')
    instance.read()
    assert.notEqual(currentIcon.innerHTML, 'pending icon', 'the current URL control no longer updates its icon during read')
  }
  assertLiveControl(url)
  const sibling = structuredClone(initial)
  sibling.persons[1].role = 'Writer'
  instance.update(sibling, initial)
  assert.equal(nameField(instance, 'a'), name)
  assert.equal(urlField('a'), url, 'tab-only update replaced the current URL control')
  assertLiveControl(url)
  instance.update({ persons: [sibling.persons[1]] }, sibling)
  for (const type of ['input', 'keydown']) assert.equal(url.listeners.get(type)?.length ?? 0, 0,
    'removed Person body retained a ' + type + ' listener')
  icon.innerHTML = 'retired icon'
  url.dispatch('input')
  assert.equal(icon.innerHTML, 'retired icon', 'a retired body control changed its detached auxiliary presentation')
  assert.equal(url.dispatch('keydown', { key: 'Enter' }).defaultPrevented, false)
  assert.equal(instance.editableFields()[0]?.key, 'person:b:name')
  const replacement = urlField('b'), replacementIcon = replacement.parentNode.querySelector('.oe-person__link-icon')
  assertLiveControl(replacement)
  instance.destroy()
  for (const type of ['input', 'keydown']) assert.equal(replacement.listeners.get(type)?.length ?? 0, 0,
    'destroyed Person body retained a ' + type + ' listener')
  replacementIcon.innerHTML = 'destroyed icon'
  replacement.dispatch('input')
  assert.equal(replacementIcon.innerHTML, 'destroyed icon')
  assert.equal(replacement.dispatch('keydown', { key: 'Enter' }).defaultPrevented, false)
})

test('Person reflects committed native text after read-only transition', () => {
  const { instance, setCanonicalData } = mount()
  const canonical = input()
  canonical.persons[0].bio = 'Native committed content'
  const old = instance.editableFields().find(field => field.key === 'person:a:bio').element
  old.textContent = canonical.persons[0].bio
  // A native edit with preserveSourceProjection commits the model but leaves
  // the plugin's local data snapshot untouched to retain browser selection.
  setCanonicalData(canonical)
  assert.equal(instance.read().persons[0].bio, '',
    'fixture accidentally synchronized the plugin model before mode change')
  instance.setReadOnly(true)
  const displayed = instance.editableFields().find(field => field.key === 'person:a:bio').element
  assert.equal(displayed.textContent, 'Native committed content',
    'read-only transition discarded native text that is already canonical')
  assert.equal(instance.read().persons[0].bio, 'Native committed content')
  instance.setReadOnly(false)
  assert.equal(instance.editableFields().find(field => field.key === 'person:a:bio').element.textContent,
    'Native committed content')
  instance.destroy()
})


test('Person cancels a drag when its tab projection is replaced', () => {
  const { instance } = mount()
  const tabs = instance.element.children[0]
  const original = tabs.children.find(tab => tab.dataset.personId === 'a')
  const started = original.dispatch('dragstart', {
    dataTransfer: { setData() {}, effectAllowed: '' },
  })
  assert.equal(started.defaultPrevented, false, 'starting an ordinary tab drag failed')

  const next = input()
  next.persons[1].role = 'Writer'
  instance.update(next, input())
  const replacement = tabs.children.find(tab => tab.dataset.personId === 'b')
  assert.notEqual(replacement, original)
  const hovered = replacement.dispatch('dragover')
  assert.equal(hovered.defaultPrevented, false,
    'newly projected tabs accepted a stale drag from a detached predecessor')
  const dropped = replacement.dispatch('drop')
  assert.equal(dropped.defaultPrevented, false,
    'a detached tab started a ghost reorder in the replacement view')
  assert.deepEqual(instance.read().persons.map(person => person.id), ['a', 'b'])
  instance.destroy()
})

test('Person accepts a fresh drag in the current tab projection', () => {
  const { instance } = mount()
  const tabs = instance.element.children[0]
  const next = input()
  next.persons[1].role = 'Writer'
  instance.update(next, input())
  const tabA = tabs.children.find(tab => tab.dataset.personId === 'a')
  const tabB = tabs.children.find(tab => tab.dataset.personId === 'b')
  tabA.dispatch('dragstart', { dataTransfer: { setData() {}, effectAllowed: '' } })
  assert.equal(tabB.dispatch('dragover').defaultPrevented, true,
    'new tab projection cannot begin a legitimate drag')
  tabA.dispatch('dragend')
  assert.equal(tabB.dispatch('dragover').defaultPrevented, false,
    'completed tab drag retained obsolete drag authority')
  instance.destroy()
})


test('Person keeps natively edited active fields when another record changes', () => {
  for (const key of ['name', 'role', 'bio']) {
    const { instance, ownerDocument, setCanonicalData } = mount()
    const fieldName = 'person:a:' + key
    const field = instance.editableFields().find(entry => entry.key === fieldName).element
    field.focus()
    // Model commit can preserve the source DOM instead of calling update().
    const canonical = input()
    canonical.persons[0][key] = 'Authored ' + key
    field.innerHTML = canonical.persons[0][key]
    setCanonicalData(canonical)
    assert.equal(instance.read().persons[0][key], '',
      'test did not simulate an independently committed native edit')

    const sibling = {
      persons: canonical.persons.map(person => person.id === 'b'
        ? { ...person, role: 'Updated sibling role' } : person),
    }
    setCanonicalData(sibling)
    instance.update(sibling, canonical)

    assert.equal(instance.editableFields().find(entry => entry.key === fieldName).element, field,
      'sibling update detached a natively edited ' + key + ' field')
    assert.equal(ownerDocument.activeElement, field,
      'sibling update blurred a natively edited ' + key + ' field')
    assert.equal(instance.read().persons[0][key], canonical.persons[0][key])
    assert.equal(instance.read().persons[1].role, 'Updated sibling role')
    instance.destroy()
  }
})

test('Person still reprojects an externally changed active field', () => {
  const { instance, setCanonicalData } = mount()
  const original = nameField(instance, 'a')
  original.innerHTML = 'Local pending name'
  const next = input()
  next.persons[0].name = 'Remote author name'
  setCanonicalData(next)
  instance.update(next, input())
  assert.notEqual(nameField(instance, 'a'), original,
    'remote active-person data change did not update its editing field')
  assert.equal(nameField(instance, 'a').textContent, 'Remote author name')
  assert.equal(instance.read().persons[0].name, 'Remote author name')
  instance.destroy()
})


test('Person keeps a natively edited link URL when a different person changes', () => {
  const initial = input()
  initial.persons[0].links.push({
    id: 'site', type: 'website', url: 'https://example.com/Alpha',
  })
  const { instance, ownerDocument, setCanonicalData } = mount(initial)
  const key = 'person:a:link:site:url'
  const original = instance.editableFields().find(field => field.key === key)?.element
  assert.ok(original, 'test missing the original link editor')
  original.focus()

  const canonical = structuredClone(initial)
  canonical.persons[0].links[0].url = 'https://example.com/AlXpha'
  original.value = canonical.persons[0].links[0].url
  setCanonicalData(canonical)
  const next = structuredClone(canonical)
  next.persons[1].role = 'Writer'
  setCanonicalData(next)
  instance.update(next, canonical)

  assert.equal(instance.editableFields().find(field => field.key === key)?.element, original,
    'Person sibling update detached a natively edited link input')
  assert.equal(ownerDocument.activeElement, original)
  assert.equal(instance.read().persons[0].links[0].url, 'https://example.com/AlXpha')
  instance.destroy()
})
