import assert from 'node:assert/strict'
import test from 'node:test'
import { ToolboxBuilder } from './ToolboxBuilder.js'

class Element {
  constructor(document, tag = 'div') {
    this.ownerDocument = document
    this.tagName = tag.toUpperCase()
    this.children = []
    this.dataset = {}
    this.style = {}
    this.attributes = new Map()
    this.listeners = new Map()
    this.className = ''
    this.value = ''
    this.textContent = ''
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child }
  append(...children) { children.forEach(child => this.appendChild(child)) }
  addEventListener(type, listener) { this.listeners.set(type, listener) }
  removeEventListener(type) { this.listeners.delete(type) }
  focus() { this.ownerDocument.activeElement = this }
  click() { this.listeners.get('click')?.({ target: this }) }
  remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this) }
  querySelectorAll(selector) {
    const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')])
    if (selector === '*') return all
    if (selector.startsWith('[role="menuitem"]')) return all.filter(child => child.getAttribute('role') === 'menuitem' && child.style.display !== 'none')
    if (selector === '.oe-toolbox__item') return all.filter(child => child.className.split(' ').includes('oe-toolbox__item'))
    return []
  }
  querySelector(selector) {
    if (selector === '.oe-toolbox__label') return this.children.find(child => child.className === 'oe-toolbox__label') ?? null
    if (selector === '.oe-toolbox__empty') return this.children.find(child => child.className === 'oe-toolbox__empty') ?? null
    return this.querySelectorAll(selector)[0] ?? null
  }
}

function setup() {
  const document = { activeElement: null, defaultView: { HTMLElement: Element } }
  document.createElement = tag => new Element(document, tag)
  const root = new Element(document, 'ul')
  const calls = []
  const builder = new ToolboxBuilder(root, {
    plugins: new Map([
      ['paragraph', { type: 'paragraph', title: 'Paragraph', icon: '' }],
      ['heading', { type: 'heading', title: 'Heading', icon: '' }],
    ]),
    inlinePlugins: new Map([['color', { type: 'color', title: 'Color', icon: '' }]]),
    i18n: { t: key => key }, filterThreshold: 0,
    onInsertBlock: type => calls.push(['block', type]),
    onInsertInlinePlugin: type => calls.push(['inline', type]),
    onClose: () => calls.push(['close']),
  })
  function key(name, current) {
    current.focus()
    const event = { key: name, target: current, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true } }
    root.listeners.get('keydown')(event)
    return event
  }
  return { builder, root, calls, key }
}

for (const name of ['Enter', ' ']) {
  test(`toolbox ${JSON.stringify(name)} activates the focused block item once`, () => {
    const { builder, root, calls, key } = setup()
    try {
      const event = key(name, root.querySelectorAll('[role="menuitem"]')[1])
      assert.deepEqual(calls, [['block', 'heading']])
      assert.equal(event.defaultPrevented, true)
      assert.equal(event.stopped, true)
    } finally { builder.destroy() }
  })
}

test('toolbox Enter activates a focused inline plugin item', () => {
  const { builder, root, calls, key } = setup()
  try {
    key('Enter', root.querySelectorAll('[role="menuitem"]')[2])
    assert.deepEqual(calls, [['inline', 'color']])
  } finally { builder.destroy() }
})

test('toolbox Enter in the filter chooses the first visible item', () => {
  const { builder, calls, key } = setup()
  try {
    builder.filterInput.value = 'heading'
    builder.filterInput.listeners.get('input')()
    key('Enter', builder.filterInput)
    assert.deepEqual(calls, [['block', 'heading']])
  } finally { builder.destroy() }
})

test('toolbox Space in the filter remains text input', () => {
  const { builder, calls, key } = setup()
  try {
    assert.equal(key(' ', builder.filterInput).defaultPrevented, false)
    assert.deepEqual(calls, [])
  } finally { builder.destroy() }
})

test('toolbox Enter with no matching results does not insert a hidden item', () => {
  const { builder, calls, key } = setup()
  try {
    builder.filterInput.value = 'no-matching-item'
    builder.filterInput.listeners.get('input')()
    key('Enter', builder.filterInput)
    assert.deepEqual(calls, [])
  } finally { builder.destroy() }
})

test('toolbox Enter on its menu root chooses the first visible item', () => {
  const { builder, root, calls, key } = setup()
  try {
    key('Enter', root)
    assert.deepEqual(calls, [['block', 'paragraph']])
  } finally { builder.destroy() }
})
