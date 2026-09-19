import test from 'node:test'
import assert from 'node:assert/strict'
import { SlashCommands } from './SlashCommands.js'

function fixture({ first = '/', second = '', composite = true, inline = false } = {}) {
  function textNodes(node) { return node.nodeType === 3 ? [node] : node.childNodes.flatMap(textNodes) }
  class Element {
    constructor(doc, tag = 'div') {
      this.nodeType = 1; this.ownerDocument = doc; this.tagName = tag.toUpperCase()
      this.childNodes = []; this.parentElement = null; this.style = {}; this.handlers = new Map()
      this.classList = { add() {}, remove() {} }; this.contentEditable = 'false'
    }
    get children() { return this.childNodes.filter(node => node.nodeType === 1) }
    get textContent() { return this.childNodes.map(node => node.textContent).join('') }
    set textContent(value) {
      this.childNodes = []
      if (value) this.appendChild({ nodeType: 3, data: value, get length() { return this.data.length },
        get textContent() { return this.data }, set textContent(value) { this.data = value } })
    }
    setAttribute() {}
    appendChild(node) { this.childNodes.push(node); node.parentElement = this; return node }
    addEventListener(type, callback) { this.handlers.set(type, callback) }
    removeEventListener(type) { this.handlers.delete(type) }
    contains(node) { return node === this || this.childNodes.some(child => child === node || child.contains?.(node)) }
    closest(selector) { return selector === '[contenteditable="true"]' && this.contentEditable === 'true' ? this : this.parentElement?.closest(selector) ?? null }
    getBoundingClientRect() { return { top: 0, bottom: 20, left: 0, right: 200, height: 20 } }
    scrollIntoView() {}
    remove() {}
  }
  let root
  const selection = { removeAllRanges() {}, addRange(range) { this.range = range } }
  const doc = {
    defaultView: { innerWidth: 1200, innerHeight: 800, NodeFilter: { SHOW_TEXT: 4 }, getSelection: () => selection, addEventListener() {}, removeEventListener() {} },
    createElement(tag) { return new Element(doc, tag) },
    createTreeWalker(node) {
      const nodes = textNodes(node); let index = 0
      return { currentNode: null, nextNode() { this.currentNode = nodes[index++] ?? null; return this.currentNode } }
    },
    createRange() {
      return {
        setStart(node, offset) { this.startContainer = node; this.startOffset = offset },
        setEnd(node, offset) { this.endContainer = node; this.endOffset = offset },
        deleteContents() {
          const all = textNodes(root), start = all.indexOf(this.startContainer)
          const endNode = this.endContainer.nodeType === 3 ? this.endContainer : textNodes(this.endContainer).at(-1)
          const end = all.indexOf(endNode)
          for (let index = start; index <= end; index++) {
            const node = all[index], from = index === start ? this.startOffset : 0
            const to = index === end && this.endContainer.nodeType === 3 ? this.endOffset : node.length
            node.data = node.data.slice(0, from) + node.data.slice(to)
          }
        },
        collapse() {}, getClientRects() { return [] },
        getBoundingClientRect() { return { top: 0, bottom: 20, left: 0, right: 10, height: 20 } },
      }
    },
  }
  root = new Element(doc)
  const field = new Element(doc, 'blockquote'); field.contentEditable = 'true'; field.textContent = first
  const sibling = new Element(doc, 'cite'); sibling.contentEditable = 'true'; sibling.textContent = second
  const content = composite ? new Element(doc) : field
  if (composite) { content.appendChild(field); content.appendChild(sibling) }
  root.appendChild(content)
  const actions = [], block = { id: 'a', element: content, contentElement: content, markDirty() {} }
  const menu = new SlashCommands(root, {
    plugins: new Map([['heading', { type: 'heading', title: 'Heading', icon: '' }]]),
    blocks: {
      getCurrentBlock: () => block, getCurrentIndex: () => 0,
      getBlockById: id => id === 'a' ? block : undefined,
      getBlockByChildNode: node => content.contains(node) ? block : undefined,
      insert(type, data, index) { actions.push(['insert', type, index]); return null },
      convert(index, type) { actions.push(['convert', type, index]); return null },
    },
    selection: {}, events: { emit() {} }, commands: { runForBlock(_block, fn) { return fn() } },
    i18n: { t: key => key },
    ...(inline ? { inlinePluginRegistry: { size: 1, values: () => [] }, inlinePluginCtx: {} } : {}),
  })
  return {
    root, field, sibling, content, menu, actions,
    input: target => root.handlers.get('input')({ target }),
    key: (key, target = field) => root.handlers.get('keydown')({ key, target, preventDefault() {}, stopPropagation() {} }),
    span(text) { const node = new Element(doc, 'em'); node.textContent = text; return node },
  }
}

test('slash query opens and filters in a first field without reading its sibling text', () => {
  const f = fixture({ second: 'attribution' })
  try {
    f.input(f.field); assert.equal(f.menu.isOpen, true)
    f.field.textContent = '/head'; f.input(f.field); f.key('Enter')
    assert.deepEqual(f.actions, [['insert', 'heading', 1]])
    assert.equal(f.sibling.textContent, 'attribution')
  } finally { f.menu.destroy() }
})

test('slash query in a later field does not depend on inline plugins being registered', () => {
  const f = fixture({ first: 'quote body', second: '/' })
  try {
    f.input(f.sibling); assert.equal(f.menu.isOpen, true)
    f.key('Escape', f.sibling)
    assert.equal(f.field.textContent, 'quote body'); assert.equal(f.sibling.textContent, '')
  } finally { f.menu.destroy() }
})

test('escaping a slash query preserves the composite field DOM', () => {
  const f = fixture()
  try {
    f.input(f.field); assert.equal(f.menu.isOpen, true); f.key('Escape')
    assert.deepEqual(f.content.children, [f.field, f.sibling])
    assert.equal(f.field.textContent, '')
  } finally { f.menu.destroy() }
})

test('slash block insertion in a composite field never replaces the whole composite block', () => {
  const f = fixture()
  try {
    f.input(f.field); f.key('Enter')
    assert.deepEqual(f.actions, [['insert', 'heading', 1]])
    assert.deepEqual(f.content.children, [f.field, f.sibling])
  } finally { f.menu.destroy() }
})

test('slash query removal spans formatted nodes but stays inside the originating field', () => {
  const f = fixture({ first: 'before/', second: '', inline: true })
  try {
    f.input(f.field); assert.equal(f.menu.isOpen, true)
    f.field.appendChild(f.span('head')); f.input(f.field); f.key('Escape')
    assert.equal(f.field.textContent, 'before')
    assert.deepEqual(f.content.children, [f.field, f.sibling])
  } finally { f.menu.destroy() }
})

test('a slash-only single-field block still converts in place', () => {
  const f = fixture({ composite: false })
  try {
    f.input(f.field); f.key('Enter')
    assert.deepEqual(f.actions, [['convert', 'heading', 0]])
  } finally { f.menu.destroy() }
})
