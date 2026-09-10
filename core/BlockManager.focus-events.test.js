// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { EventBus } from '@shelamkoff/event-bus'
import { BlockManager } from './BlockManager.js'
import { CommandDispatcher } from './CommandDispatcher.js'
import { EditorEvent } from './editorEvents.js'

class FakeClassList {
  #values = new Set()
  toggle(name, force) { if (force) this.#values.add(name); else this.#values.delete(name) }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase()
    this.children = []
    this.parentNode = null
    this.style = {}
    this.attrs = new Map()
    this.classList = new FakeClassList()
    this.className = ''
    this.contentEditable = 'false'
    this.tabIndex = -1
  }

  setAttribute(name, value) { this.attrs.set(name, String(value)) }
  appendChild(element) { if (element.parentNode) element.remove(); this.children.push(element); element.parentNode = this; return element }
  prepend(element) { if (element.parentNode) element.remove(); this.children.unshift(element); element.parentNode = this }
  insertBefore(element, next) { if (element.parentNode) element.remove(); const index = this.children.indexOf(next); if (index < 0) this.appendChild(element); else { this.children.splice(index, 0, element); element.parentNode = this } }
  after(element) { const parent = this.parentNode; if (!parent) return; if (element.parentNode) element.remove(); const index = parent.children.indexOf(this); parent.children.splice(index + 1, 0, element); element.parentNode = parent }
  remove() { const parent = this.parentNode; if (!parent) return; const index = parent.children.indexOf(this); if (index >= 0) parent.children.splice(index, 1); this.parentNode = null }
  replaceChildren(...elements) { for (const child of this.children) child.parentNode = null; this.children = []; for (const element of elements) this.appendChild(element) }
  querySelectorAll() { return [] }
  querySelector() { return null }
  matches() { return false }
  getBoundingClientRect() { return { top: 0 } }
  animate() { return { finished: Promise.resolve() } }
  focus() {}
}

test('moving an unfocused block does not publish a focus transition', () => {
  const globals = {
    HTMLElement: globalThis.HTMLElement,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    HTMLSelectElement: globalThis.HTMLSelectElement,
    document: globalThis.document,
  }
  globalThis.HTMLElement = FakeElement
  globalThis.HTMLInputElement = class extends FakeElement {}
  globalThis.HTMLTextAreaElement = class extends FakeElement {}
  globalThis.HTMLButtonElement = class extends FakeElement {}
  globalThis.HTMLSelectElement = class extends FakeElement {}
  globalThis.document = { createElement(tag) { return new FakeElement(tag) } }

  try {
    const events = new EventBus()
    const container = new FakeElement()
    const plugin = {
      type: 'paragraph',
      render() { return new FakeElement('p') },
      save() { return { text: '' } },
    }
    const manager = new BlockManager(container, new Map([['paragraph', plugin]]), events)
    manager.setCommandDispatcher(new CommandDispatcher(manager, events))
    for (const id of ['a', 'b', 'c']) manager.insert('paragraph', {}, undefined, id)

    manager.setCurrentIndex(1)
    const focused = []
    events.on(EditorEvent.BLOCK_FOCUSED, ({ blockId }) => focused.push(blockId))

    manager.move(2, 0)

    assert.equal(manager.getCurrentBlock().id, 'b')
    assert.deepEqual(focused, [])
  } finally {
    Object.assign(globalThis, globals)
  }
})
