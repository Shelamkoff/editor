// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createColorSwatchPlugin } from './color.js'

test('color plugin destroy detaches hydrated widget listeners from retained DOM', () => {
  const plugin = createColorSwatchPlugin()
  const widget = new EventTarget()
  let readOnlyReads = 0
  const ctx = {
    get readOnly() { readOnlyReads += 1; return true },
    showPopup() {},
    hidePopup() {},
    mutate() {},
    notifyChanged() {},
  }

  plugin.hydrate(widget, ctx)
  widget.dispatchEvent(new Event('click'))
  assert.equal(readOnlyReads, 1)

  plugin.destroy?.()
  widget.dispatchEvent(new Event('click'))
  assert.equal(readOnlyReads, 1, 'destroyed plugin must release retained widget listeners')
})
