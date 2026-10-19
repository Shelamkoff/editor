import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasInlineContent,
  hasProtectedDomContent,
  normalizeAuthoredText,
} from './inlineContent.js'

const ELEMENT_NODE = 1
const TEXT_NODE = 3

function selectorMatches(element, selector) {
  return selector.split(',').some(raw => {
    const part = raw.trim()
    if (part.startsWith('[')) {
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(part)
      return !!attr && (attr[2] === undefined
        ? element.attrs.has(attr[1])
        : element.attrs.get(attr[1]) === attr[2])
    }
    return element.tagName.toLowerCase() === part.toLowerCase()
  })
}

class TestNode {
  constructor(type) {
    this.nodeType = type
    this.parentNode = null
    this.childNodes = []
  }

  get firstChild() { return this.childNodes[0] ?? null }
  get nextSibling() {
    const siblings = this.parentNode?.childNodes ?? []
    const index = siblings.indexOf(this)
    return index < 0 ? null : siblings[index + 1] ?? null
  }
  get textContent() { return this.childNodes.map(node => node.textContent).join('') }

  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) node.parentNode.removeChild(node)
      node.parentNode = this
      this.childNodes.push(node)
    }
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node)
    assert.notEqual(index, -1, 'Fixture attempted to remove a foreign child')
    this.childNodes.splice(index, 1)
    node.parentNode = null
    return node
  }
}

class TestText extends TestNode {
  constructor(data) {
    super(TEXT_NODE)
    this.data = data
  }
  get textContent() { return this.data }
  appendData(text) { this.data += text }
}

class TestElement extends TestNode {
  constructor(tagName, attrs = {}) {
    super(ELEMENT_NODE)
    this.tagName = tagName.toUpperCase()
    this.attrs = new Map(Object.entries(attrs))
  }
  matches(selector) { return selectorMatches(this, selector) }
  closest(selector) {
    for (let node = this; node; node = node.parentNode) {
      if (node.nodeType === ELEMENT_NODE && node.matches(selector)) return node
    }
    return null
  }
  querySelector(selector) {
    for (const node of this.childNodes) {
      if (node.nodeType !== ELEMENT_NODE) continue
      if (node.matches(selector)) return node
      const nested = node.querySelector(selector)
      if (nested) return nested
    }
    return null
  }
}

const text = value => new TestText(value)
const el = (tag, attrs, ...children) => {
  const element = new TestElement(tag, attrs)
  element.append(...children)
  return element
}

test('empty protected controls count as real content even without text', () => {
  const button = el('button', {})
  const locked = el('span', { contenteditable: 'false' })
  const author = el('b', {}, button, locked)
  assert.equal(author.textContent, '')
  assert.equal(hasProtectedDomContent(author), true)
  assert.equal(hasInlineContent(author), true)
  assert.equal(hasInlineContent(el('b', {})), false)
})

test('only authored text is normalized; native, locked and widget leaves retain identity', () => {
  const originalNative = [text('na'), text('tive')]
  const originalLocked = [text('lo'), text('cked')]
  const originalWidget = [text('wid'), text('get')]
  const button = el('button', {}, ...originalNative)
  const locked = el('span', { contenteditable: 'false' }, ...originalLocked)
  const widget = el('span', { 'data-inline-plugin': 'test' }, ...originalWidget)
  const author = el('i', {}, text('ab'), text(''), text('cd'))
  const field = el('div', { contenteditable: 'true' }, author, button, locked, widget)
  normalizeAuthoredText(field)
  assert.deepEqual(author.childNodes.map(node => node.data), ['abcd'])
  for (const [owner, original] of [
    [button, originalNative],
    [locked, originalLocked],
    [widget, originalWidget],
  ]) {
    assert.equal(owner.childNodes.length, 2)
    assert.equal(owner.childNodes[0], original[0])
    assert.equal(owner.childNodes[1], original[1])
    assert.equal(original[0].parentNode, owner)
    assert.equal(original[1].parentNode, owner)
  }
})

test('normalization does not enter nested editing hosts or a protected root', () => {
  const nested = el('div', { contenteditable: 'true' }, text('ne'), text('sted'))
  const root = el('div', {}, text('au'), text('thor'), nested)
  normalizeAuthoredText(root)
  assert.deepEqual(root.childNodes.slice(0, 1).map(node => node.data), ['author'])
  assert.equal(nested.childNodes.length, 2)
  normalizeAuthoredText(nested)
  assert.equal(nested.childNodes.length, 1, 'Explicitly targeted editing host should normalize')
  const native = el('button', {}, text('ha'), text('ndler'))
  normalizeAuthoredText(native)
  assert.equal(native.childNodes.length, 2)
})
