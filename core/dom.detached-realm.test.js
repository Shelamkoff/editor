// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { positionPopup } from './dom.js'

test('detached popup positioning does not borrow an ambient viewport', () => {
  const popup = {
    ownerDocument: { defaultView: null },
    offsetHeight: 100,
    style: {},
  }
  const previousWindow = globalThis.window
  globalThis.window = new Proxy({}, { get() { throw new Error('ambient window must not be used') } })
  try {
    positionPopup(
      popup,
      { top: 900, bottom: 920 },
      { top: 0, bottom: 1000 },
      { defaultHeight: 100 },
    )
  } finally {
    globalThis.window = previousWindow
  }

  assert.equal(popup.style.top, '924px')
  assert.equal(popup.style.bottom, 'auto')
})
