// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { Block } from './Block.js'
import { READ_ONLY_INTERACTIVE_ATTRIBUTE } from './constants.js'

class Element {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = ownerDocument
    this.children = []
    this.style = {}
    this.attributes = new Map()
    this.classList = { toggle() {} }
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)) }
  getAttribute(key) { return this.attributes.get(key) ?? null }
  hasAttribute(key) { return this.attributes.has(key) }
  matches(selector) {
    return selector.split(',').some(part => {
      const value = part.trim()
      return value === '[contenteditable]' ? this.hasAttribute('contenteditable') : value.toUpperCase() === this.tagName
    })
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [ ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector) ])
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child }
}
class Input extends Element { type = 'text'; readOnly = false; disabled = false }
class TextArea extends Element { readOnly = false; disabled = false }
class Button extends Element { disabled = false }
class Select extends Element { disabled = false }

function setup(tag, type, nested, readOnly = true, interactive = false) {
  const constructors = { input: Input, textarea: TextArea, button: Button, select: Select }
  const ownerDocument = {
    defaultView: { HTMLElement: Element, HTMLInputElement: Input, HTMLTextAreaElement: TextArea,
      HTMLButtonElement: Button, HTMLSelectElement: Select },
    createElement(name) { return new (constructors[name] ?? Element)(name, this) },
  }
  const control = ownerDocument.createElement(tag)
  if (tag === 'input') control.type = type
  if (interactive) control.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
  const root = nested ? ownerDocument.createElement('div') : control
  if (nested) root.appendChild(control)
  const plugin = { type: 'native', render() { return root }, save() { return {} } }
  new Block(plugin, { runForBlock() { throw new Error('no command during construction') } }, {}, 'native', readOnly, {}, ownerDocument)
  return control
}

for (const nested of [false, true]) {
  const position = nested ? 'nested' : 'root'
  for (const tag of ['input', 'textarea']) {
    test(`read-only makes ${position} ${tag} immutable but focusable`, () => {
      const control = setup(tag, 'text', nested)
      assert.equal(control.readOnly, true)
      assert.equal(control.disabled, false)
    })
  }
  for (const tag of ['button', 'select']) {
    test(`read-only disables ${position} ${tag} without interactive opt-in`, () => {
      assert.equal(setup(tag, undefined, nested).disabled, true)
      assert.equal(setup(tag, undefined, nested, true, true).disabled, false)
    })
  }
  for (const type of ['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset', 'image']) {
    test(`read-only disables ${position} input[type=${type}]`, () => {
      assert.equal(setup('input', type, nested).disabled, true)
    })
  }
  test(`editable mode leaves ${position} native controls enabled`, () => {
    for (const tag of ['input', 'textarea', 'button', 'select']) {
      const control = setup(tag, 'checkbox', nested, false)
      assert.equal(control.disabled, false)
      if ('readOnly' in control) assert.equal(control.readOnly, false)
    }
  })
}
