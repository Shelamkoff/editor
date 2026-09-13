// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { MenuPositioner } from './MenuPositioner.js'

test('settings menu positioning reads viewport from the editor owning window', () => {
  const menu = { style: {}, offsetHeight: 100 }
  const toolbar = {
    offsetTop: 10,
    offsetHeight: 20,
    offsetParent: null,
    getBoundingClientRect() { return { right: 80 } },
  }
  const root = {
    ownerDocument: { defaultView: { innerWidth: 1200, innerHeight: 500 } },
    querySelector(selector) { return selector === '.oe-toolbar' ? toolbar : null },
    getBoundingClientRect() { return { top: 0, right: 100, bottom: 400 } },
  }
  toolbar.offsetParent = root

  const previousWindow = globalThis.window
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  try {
    new MenuPositioner(menu, root, 768).position()
  } finally {
    globalThis.window = previousWindow
  }

  assert.equal(menu.style.right, '20px')
  assert.equal(menu.style.top, '34px')
  assert.equal(menu.style.bottom, 'auto')
})

test('settings menu mobile mode uses the editor owning viewport width', () => {
  const menu = { style: { top: '1px', bottom: '2px', left: '3px', right: '4px' } }
  const root = { ownerDocument: { defaultView: { innerWidth: 500, innerHeight: 700 } } }

  const previousWindow = globalThis.window
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  try {
    new MenuPositioner(menu, root, 768).position()
  } finally {
    globalThis.window = previousWindow
  }

  assert.deepEqual(menu.style, { top: '', bottom: '', left: '', right: '' })
})
