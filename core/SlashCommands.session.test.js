import test from 'node:test'
import assert from 'node:assert/strict'
import { SlashCommands } from './SlashCommands.js'

function fixture() {
  class Element {
    constructor(doc) {
      this.ownerDocument = doc; this.children = []; this.childNodes = this.children
      this.style = {}; this.handlers = new Map(); this.textContent = ''; this.parentElement = null
      this.classList = { add() {}, remove() {} }
    }
    setAttribute() {}
    appendChild(el) { this.children.push(el); el.parentElement = this; return el }
    addEventListener(type, fn) { this.handlers.set(type, fn) }
    removeEventListener(type) { this.handlers.delete(type) }
    remove() {}
    scrollIntoView() {}
    contains(el) { return this === el || this.children.some(child => child.contains(el)) }
    getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20 } }
    closest(selector) { return selector.includes('contenteditable') ? this : null }
  }
  const doc = {
    createElement() { return new Element(doc) },
    createTreeWalker() { return { nextNode() { return false } } },
    defaultView: { innerWidth: 1000, innerHeight: 1000, addEventListener() {}, removeEventListener() {} },
  }
  const root = new Element(doc)
  const makeBlock = id => {
    const contentElement = new Element(doc)
    contentElement.textContent = '/'
    root.appendChild(contentElement)
    return { id, contentElement, element: contentElement }
  }
  const a = makeBlock('a'), b = makeBlock('b')
  let current = a
  const live = new Map([['a', a], ['b', b]])
  const mutations = []
  const menu = new SlashCommands(root, {
    plugins: new Map([['paragraph', { type: 'paragraph', title: 'Paragraph', icon: '' }]]),
    blocks: {
      getCurrentBlock() { return current }, getCurrentIndex() { return current === a ? 0 : 1 },
      getBlockById(id) { return live.get(id) },
      getBlockByChildNode(field) { return [...live.values()].find(block => block.contentElement === field) },
    },
    selection: {}, events: { emit() {} },
    commands: { runForBlock(block) { mutations.push(block.id) } },
    i18n: { t: key => key },
  })
  const open = () => root.handlers.get('input')({ target: a.contentElement })
  const enter = target => {
    const event = { target, key: 'Enter', defaultPrevented: false, preventDefault() { this.defaultPrevented = true }, stopPropagation() {} }
    root.handlers.get('keydown')(event)
    return event
  }
  return { root, menu, a, b, live, mutations, open, enter, current: block => { current = block } }
}

test('slash menu does not target another block after focus/current-block changes', () => {
  const f = fixture()
  try {
    f.open(); assert.equal(f.menu.isOpen, true)
    f.current(f.b)
    const event = f.enter(f.b.contentElement)
    assert.equal(event.defaultPrevented, false)
    assert.deepEqual(f.mutations, [])
    assert.equal(f.menu.isOpen, false)
  } finally { f.menu.destroy() }
})

test('slash menu rejects a replacement block that reuses the session id', () => {
  const f = fixture()
  try {
    f.open()
    const replacement = { ...f.a, contentElement: f.b.contentElement }
    f.live.set('a', replacement); f.current(replacement)
    const event = f.enter(replacement.contentElement)
    assert.equal(event.defaultPrevented, false)
    assert.deepEqual(f.mutations, [])
  } finally { f.menu.destroy() }
})

test('slash menu still accepts Enter from its live originating field', () => {
  const f = fixture()
  try {
    f.open()
    assert.equal(f.enter(f.a.contentElement).defaultPrevented, true)
    assert.deepEqual(f.mutations, ['a'])
  } finally { f.menu.destroy() }
})

test('leaving the originating field closes the slash session', () => {
  const f = fixture()
  try {
    f.open()
    f.root.handlers.get('focusout')({ relatedTarget: f.b.contentElement })
    assert.equal(f.menu.isOpen, false)
    assert.deepEqual(f.mutations, [])
  } finally { f.menu.destroy() }
})

for (const change of ['reopen', 'filter', 'keyboard redraw']) {
  test(`retained slash item is inert after ${change} while the current item remains usable`, () => {
    const f = fixture()
    const activate = item => item.handlers.get('mousedown')({ preventDefault() {}, stopPropagation() {} })
    try {
      f.open()
      const menu = f.root.children.at(-1)
      const oldItem = menu.children.at(-1)
      if (change === 'reopen') { f.menu.close(); f.open() }
      else if (change === 'filter') {
        f.a.contentElement.textContent = '/para'; f.open()
      } else {
        f.root.handlers.get('keydown')({ target: f.a.contentElement, key: 'ArrowDown', preventDefault() {}, stopPropagation() {} })
      }
      const currentItem = menu.children.at(-1)
      assert.notStrictEqual(currentItem, oldItem)
      activate(oldItem)
      assert.deepEqual(f.mutations, [], 'obsolete DOM must not invoke the current command session')
      assert.equal(f.menu.isOpen, true)
      activate(currentItem)
      assert.deepEqual(f.mutations, ['a'])
      assert.equal(f.menu.isOpen, false)
    } finally { f.menu.destroy() }
  })
}
