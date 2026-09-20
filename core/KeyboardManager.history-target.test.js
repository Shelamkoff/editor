import assert from 'node:assert/strict'
import test from 'node:test'
import { KeyboardManager } from './KeyboardManager.js'
import { ShortcutRegistry } from './ShortcutRegistry.js'
import { BLOCK_SELECTOR } from './constants.js'

function setup(tag, marker = null, inBlock = true) {
  const listeners = new Map()
  const ownerDocument = { defaultView: null }
  const root = {
    ownerDocument,
    addEventListener(type, listener) { listeners.set(type, listener) },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    },
    contains() { return true },
  }
  const calls = []
  const shortcuts = new ShortcutRegistry()
  shortcuts.register('Mod+Z', () => calls.push('undo'), { scope: 'editor' })
  shortcuts.register('Mod+Shift+Z', () => calls.push('redo'), { scope: 'editor' })
  shortcuts.register('Mod+Y', () => calls.push('redo'), { scope: 'editor' })
  const field = {
    hasAttribute(name) { return name === 'data-oe-document-input' && marker !== null },
    getAttribute(name) { return name === 'data-oe-document-input' ? marker : null },
  }
  const target = {
    closest(selector) {
      if (selector === BLOCK_SELECTOR) return inBlock ? {} : null
      if (selector === 'input, textarea, select') return ['input', 'textarea', 'select'].includes(tag) ? field : null
      if (selector.includes('button') && tag === 'button') return target
      if (selector.includes('a[href]') && tag === 'a') return target
      return null
    },
  }
  const manager = new KeyboardManager(root, {}, shortcuts, {}, { emit() {} }, 'paragraph')
  function key(code, shiftKey = false, metaKey = false) {
    const event = {
      target, code, key: code.slice(3).toLowerCase(), ctrlKey: !metaKey, metaKey,
      shiftKey, altKey: false, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
    }
    listeners.get('keydown')(event)
    return event
  }
  return { calls, key, manager }
}

for (const tag of ['input', 'textarea', 'select']) {
  test(`auxiliary ${tag} inside a block retains native Undo and Redo`, () => {
    const { key, calls, manager } = setup(tag)
    try {
      for (const event of [key('KeyZ'), key('KeyZ', true), key('KeyY'), key('KeyZ', false, true)]) {
        assert.equal(event.defaultPrevented, false, 'auxiliary field must retain its native history shortcut')
      }
      assert.deepEqual(calls, [], 'native auxiliary history must not change the editor document')
    } finally { manager.destroy() }
  })
}

for (const marker of ['', 'history', 'value']) {
  test(`document-backed input marker ${JSON.stringify(marker)} still routes editor history`, () => {
    const { key, calls, manager } = setup('textarea', marker)
    try {
      assert.equal(key('KeyZ').defaultPrevented, true)
      assert.equal(key('KeyZ', true).defaultPrevented, true)
      assert.equal(key('KeyY').defaultPrevented, true)
      assert.deepEqual(calls, ['undo', 'redo', 'redo'])
    } finally { manager.destroy() }
  })
}

for (const tag of ['button', 'a']) {
  test(`${tag} inside a block keeps editor history`, () => {
    const { key, calls, manager } = setup(tag)
    try {
      assert.equal(key('KeyZ').defaultPrevented, true)
      assert.deepEqual(calls, ['undo'])
    } finally { manager.destroy() }
  })
}
